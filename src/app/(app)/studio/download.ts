import JSZip from "jszip";

// Dispara o download de um Blob já em memória (sem precisar buscar de
// nenhuma URL) — usado tanto pelos helpers abaixo (que buscam de uma URL
// primeiro) quanto por ferramentas 100% client-side (Aplicador de Marca)
// que geram o resultado direto no canvas, sem passar pelo R2.
export function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

// Baixa uma URL pública do R2 pro computador do usuário — o resultado
// processado só existia no bucket até agora, essa é a etapa que falta pra
// tirar o arquivo de lá de fato (edição/salvar só sobrescreve no R2).
export async function downloadUrl(url: string, filename: string) {
  const res = await fetch(url, { cache: "no-store" });
  const blob = await res.blob();
  downloadBlob(blob, filename);
}

// Compacta vários Blobs já em memória num .zip só.
export async function zipBlobs(items: { blob: Blob; filename: string }[], zipName: string) {
  const zip = new JSZip();
  items.forEach((item) => zip.file(item.filename, item.blob));
  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, zipName);
}

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
