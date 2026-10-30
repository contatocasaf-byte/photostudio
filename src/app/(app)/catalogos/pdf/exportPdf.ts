"use client";

import { downloadUrl } from "@/lib/downloadFiles";
import { getPublicUrl } from "@/lib/storage/public-url";
import { buildPdfExportPayload, collectDistinctFotoUrls } from "../core/pdfExport";
import type { PreviewPage } from "../core/reflow";
import { getCatalogPdfPhotoUploadUrls } from "./actions";
import { filtrarPendentesCache, galeriaCachePronto, garantirFotosNoCache } from "../galeria/cacheActions";

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

const LOTE_CACHE = 10;

type FotoRefLocal = { fileId: string; version: string; key: string };

// Caminho rápido: as fotos já ficam num bucket privado do R2 (cache), então
// o navegador NÃO baixa nem sobe nada — só pede ao servidor pra copiar as
// que ainda faltam (1ª vez, ou foto substituída no Drive) e manda as
// chaves pro servidor de PDF, que lê direto do R2.
async function prepararFotosNoCache(
  pages: PreviewPage[],
  onProgress?: (msg: string) => void
): Promise<{ keyByUrl: Map<string, string>; falharam: number; urlsSemRef: string[] }> {
  const refsPorKey = new Map<string, FotoRefLocal>();
  const urlsPorKey = new Map<string, Set<string>>();
  const urlsSemRef = new Set<string>();
  for (const page of pages) {
    for (const card of page.cards) {
      const url = card.product.fotoUrl;
      if (!url) continue;
      const ref = card.product.fotoRef;
      if (!ref) {
        urlsSemRef.add(url);
        continue;
      }
      refsPorKey.set(ref.key, ref);
      const urls = urlsPorKey.get(ref.key) ?? new Set<string>();
      urls.add(url);
      urlsPorKey.set(ref.key, urls);
    }
  }

  const falhas = new Set<string>();
  const filtro = await filtrarPendentesCache([...refsPorKey.values()]);
  if (filtro.error || !filtro.pendentes) throw new Error(filtro.error ?? "Falha ao consultar o cache de fotos.");
  const pendentes = filtro.pendentes;

  if (pendentes.length > 0) {
    let feitas = 0;
    onProgress?.(`Preparando fotos 0/${pendentes.length}...`);
    for (let i = 0; i < pendentes.length; i += LOTE_CACHE) {
      const lote = pendentes.slice(i, i + LOTE_CACHE);
      const res = await garantirFotosNoCache(lote);
      if (res.error || !res.resultados) lote.forEach((r) => falhas.add(r.key));
      else for (const r of res.resultados) if (!r.ok) falhas.add(r.key);
      feitas += lote.length;
      onProgress?.(`Preparando fotos ${feitas}/${pendentes.length}...`);
    }
  }

  const keyByUrl = new Map<string, string>();
  for (const [key, urls] of urlsPorKey) {
    if (falhas.has(key)) continue;
    for (const url of urls) keyByUrl.set(url, key);
  }
  return { keyByUrl, falharam: falhas.size, urlsSemRef: [...urlsSemRef] };
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

  let fotoKeyByUrl = new Map<string, string>();
  let falharam = 0;

  // Cache de fotos ligado E servidor de PDF também pronto pra ler o bucket:
  // caminho rápido. Qualquer problema nele cai no caminho antigo (baixar e
  // subir cada foto), que sempre funciona.
  let usouCache = false;
  try {
    if (await galeriaCachePronto()) {
      const r = await prepararFotosNoCache(pages, onProgress);
      fotoKeyByUrl = r.keyByUrl;
      falharam = r.falharam;
      if (r.urlsSemRef.length > 0) {
        const antigo = await stagePhotosToR2(r.urlsSemRef, onProgress);
        antigo.keyByUrl.forEach((key, url) => fotoKeyByUrl.set(url, key));
        falharam += antigo.falharam;
      }
      usouCache = true;
    }
  } catch {
    usouCache = false;
  }

  if (!usouCache) {
    const antigo = await stagePhotosToR2(collectDistinctFotoUrls(pages), onProgress);
    fotoKeyByUrl = antigo.keyByUrl;
    falharam = antigo.falharam;
  }
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
