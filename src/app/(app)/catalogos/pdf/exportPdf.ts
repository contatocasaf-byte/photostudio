"use client";

import { downloadUrl } from "@/lib/downloadFiles";
import { getPublicUrl } from "@/lib/storage/public-url";
import { buildPdfExportPayload, collectDistinctFotoUrls } from "../core/pdfExport";
import type { PreviewPage } from "../core/reflow";
import { getCatalogPdfPhotoUploadUrl } from "./actions";

// Fotos de produto vêm da rota-proxy autenticada da galeria (Google
// Drive) — o backend Python não tem credencial do Drive, então cada
// foto distinta usada no catálogo precisa de uma cópia temporária no
// R2 antes da geração (ver actions.ts). Busca + upload em paralelo por
// foto, dedupe já garantido por collectDistinctFotoUrls.
async function stagePhotosToR2(fotoUrls: string[]): Promise<Map<string, string>> {
  const entries = await Promise.all(
    fotoUrls.map(async (fotoUrl): Promise<[string, string] | null> => {
      const res = await fetch(fotoUrl);
      if (!res.ok) return null;
      const blob = await res.blob();

      const { url, key, error } = await getCatalogPdfPhotoUploadUrl({ contentType: blob.type || "image/jpeg" });
      if (error || !url || !key) return null;

      const putRes = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": blob.type || "image/jpeg" } });
      if (!putRes.ok) return null;

      return [fotoUrl, key];
    })
  );

  return new Map(entries.filter((e): e is [string, string] => e !== null));
}

export async function exportCatalogPdf(params: {
  pages: PreviewPage[];
  paginaLargura: number;
  paginaAltura: number;
  catalogNome: string;
  validadeTexto?: string;
}): Promise<void> {
  const { pages, paginaLargura, paginaAltura, catalogNome, validadeTexto = "" } = params;

  const fotoUrls = collectDistinctFotoUrls(pages);
  const fotoKeyByUrl = await stagePhotosToR2(fotoUrls);

  const payload = buildPdfExportPayload(pages, paginaLargura, paginaAltura, fotoKeyByUrl, validadeTexto);

  const res = await fetch("/api/catalogos/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Falha ao gerar PDF.");

  const filename = `${catalogNome.trim() || "catalogo"}.pdf`;
  await downloadUrl(getPublicUrl(data.resultKey as string), filename);
}
