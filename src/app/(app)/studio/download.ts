import { zipBlobs } from "@/lib/downloadFiles";

export { downloadBlob, downloadUrl, zipBlobs, uniqueName } from "@/lib/downloadFiles";

// Baixa várias fotos processadas de uma vez, compactadas num .zip só —
// usado no modo Lote em vez de baixar uma a uma.
export async function downloadAllAsZip(items: { url: string; filename: string }[], zipName: string) {
  const blobs = await Promise.all(
    items.map(async (item) => {
      const res = await fetch(item.url, { cache: "no-store" });
      return { blob: await res.blob(), filename: item.filename };
    })
  );
  await zipBlobs(blobs, zipName);
}

// Nome de arquivo pra download a partir do nome original enviado —
// resultado exportado é sempre PNG (fundo transparente).
export function pngFilenameFor(originalName: string) {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}.png`;
}

// Mesma ideia, pra versão comprimida (sempre JPEG, ver compress.ts) —
// sufixo "_web" deixa claro que não é a foto em alta resolução.
export function jpgFilenameFor(originalName: string) {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}_web.jpg`;
}
