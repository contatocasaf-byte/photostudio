import JSZip from "jszip";

// Baixa uma URL pública do R2 pro computador do usuário — o resultado
// processado só existe no bucket até agora, essa é a etapa que falta pra
// tirar o arquivo de lá de fato (edição/salvar só sobrescreve no R2).
export async function downloadUrl(url: string, filename: string) {
  const res = await fetch(url, { cache: "no-store" });
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

// Baixa várias fotos processadas de uma vez, compactadas num .zip só —
// usado no modo Lote em vez de baixar uma a uma.
export async function downloadAllAsZip(items: { url: string; filename: string }[], zipName: string) {
  const zip = new JSZip();
  await Promise.all(
    items.map(async (item) => {
      const res = await fetch(item.url, { cache: "no-store" });
      const blob = await res.blob();
      zip.file(item.filename, blob);
    })
  );
  const content = await zip.generateAsync({ type: "blob" });
  const objectUrl = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

// Nome de arquivo pra download a partir do nome original enviado —
// resultado exportado é sempre PNG (fundo transparente).
export function pngFilenameFor(originalName: string) {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}.png`;
}
