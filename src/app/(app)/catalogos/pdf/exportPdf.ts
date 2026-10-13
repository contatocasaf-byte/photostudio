"use client";

import { downloadUrl } from "@/lib/downloadFiles";
import { getPublicUrl } from "@/lib/storage/public-url";
import { buildPdfExportPayload, collectDistinctFotoUrls } from "../core/pdfExport";
import type { PreviewPage } from "../core/reflow";
import { getCatalogPdfPhotoUploadUrls } from "./actions";

// Quantas fotos baixam/sobem ao mesmo tempo — baixar todas de uma vez
// estoura o limite de requisições do Drive e do navegador.
const PHOTO_CONCURRENCY = 6;

// Fotos de produto vêm da rota-proxy autenticada da galeria (Google
// Drive) — o backend Python não tem credencial do Drive, então cada
// foto distinta usada no catálogo precisa de uma cópia temporária no
// R2 antes da geração (ver actions.ts). URLs de upload pedidas de uma
// vez só; baixa+sobe com concorrência limitada; foto que falha é
// pulada (conta em `falharam`) em vez de derrubar o PDF inteiro.
async function stagePhotosToR2(
  fotoUrls: string[],
  onProgress?: (msg: string) => void
): Promise<{ keyByUrl: Map<string, string>; falharam: number }> {
  const keyByUrl = new Map<string, string>();
  if (fotoUrls.length === 0) return { keyByUrl, falharam: 0 };

  const { uploads, error } = await getCatalogPdfPhotoUploadUrls({ count: fotoUrls.length });
  if (error || !uploads) throw new Error(error ?? "Falha ao preparar o envio das fotos.");

  let next = 0;
  let feitas = 0;
  let falharam = 0;
  onProgress?.(`Enviando fotos 0/${fotoUrls.length}...`);

  async function worker() {
    while (next < fotoUrls.length) {
      const i = next++;
      try {
        const res = await fetch(fotoUrls[i]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const putRes = await fetch(uploads![i].url, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": blob.type || "image/jpeg" },
        });
        if (!putRes.ok) throw new Error(`R2 HTTP ${putRes.status}`);
        keyByUrl.set(fotoUrls[i], uploads![i].key);
      } catch {
        falharam++;
      }
      feitas++;
      onProgress?.(`Enviando fotos ${feitas}/${fotoUrls.length}...`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PHOTO_CONCURRENCY, fotoUrls.length) }, worker));

  return { keyByUrl, falharam };
}

export async function exportCatalogPdf(params: {
  pages: PreviewPage[];
  paginaLargura: number;
  paginaAltura: number;
  catalogNome: string;
  validadeTexto?: string;
  onProgress?: (msg: string) => void;
}): Promise<{ fotosFalharam: number }> {
  const { pages, paginaLargura, paginaAltura, catalogNome, validadeTexto = "", onProgress } = params;

  const fotoUrls = collectDistinctFotoUrls(pages);
  const { keyByUrl: fotoKeyByUrl, falharam } = await stagePhotosToR2(fotoUrls, onProgress);
  onProgress?.("Gerando o PDF no servidor...");

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
  return { fotosFalharam: falharam };
}
