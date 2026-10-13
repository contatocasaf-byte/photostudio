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
  onProgress?.("Iniciando a geração do PDF no servidor...");

  const payload = buildPdfExportPayload(pages, paginaLargura, paginaAltura, fotoKeyByUrl, validadeTexto);

  const startRes = await fetch("/api/catalogos/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const start = await readJson<{ jobId?: string; error?: string }>(startRes);
  if (!startRes.ok || !start.jobId) throw new Error(start.error ?? "Falha ao iniciar a geração do PDF.");

  const result = await waitForPdfJob(start.jobId, onProgress);

  const filename = `${catalogNome.trim() || "catalogo"}.pdf`;
  await downloadUrl(getPublicUrl(result.resultKey), filename);
  return { fotosFalharam: falharam + (result.imagensIgnoradas ?? 0) };
}

// Resposta que não é JSON (ex.: página de erro em texto da Vercel) vira
// uma mensagem legível em vez de "Unexpected token ... is not valid
// JSON".
async function readJson<T extends { error?: string }>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: `Resposta inesperada do servidor (HTTP ${res.status}): ${text.slice(0, 160)}` } as T;
  }
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

async function waitForPdfJob(
  jobId: string,
  onProgress?: (msg: string) => void
): Promise<{ resultKey: string; imagensIgnoradas?: number }> {
  const startedAt = Date.now();
  let falhasSeguidas = 0;

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    onProgress?.(`Gerando o PDF no servidor... ${Math.round((Date.now() - startedAt) / 1000)}s`);

    let res: Response;
    try {
      res = await fetch(`/api/catalogos/pdf/status/${jobId}`, { cache: "no-store" });
    } catch {
      // Falha de rede momentânea: tenta de novo algumas vezes antes de desistir.
      if (++falhasSeguidas >= 5) throw new Error("Sem conexão com o servidor ao acompanhar a geração do PDF.");
      continue;
    }
    const data = await readJson<{ status?: string; resultKey?: string; imagensIgnoradas?: number; error?: string }>(res);

    if (!res.ok) {
      // 404 = o serviço reiniciou e perdeu o trabalho; outros erros podem ser passageiros.
      if (res.status === 404 || ++falhasSeguidas >= 5) throw new Error(data.error ?? "Falha ao acompanhar a geração do PDF.");
      continue;
    }
    falhasSeguidas = 0;

    if (data.status === "done" && data.resultKey) return { resultKey: data.resultKey, imagensIgnoradas: data.imagensIgnoradas };
    if (data.status === "error") throw new Error(data.error ?? "Falha ao gerar PDF.");
  }
  throw new Error("A geração do PDF demorou mais de 15 minutos e foi interrompida.");
}
