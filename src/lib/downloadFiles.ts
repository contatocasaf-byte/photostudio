import JSZip from "jszip";

// Dispara o download de um Blob já em memória (sem precisar buscar de
// nenhuma URL) — usado por ferramentas 100% client-side (Aplicador de
// Marca, Comparador de Pastas, Gerador de Ofertas) que geram o
// resultado direto no canvas, sem passar por upload nenhum.
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

// Evita colisão de nome dentro de um zip — acrescenta _2, _3... até achar
// um nome livre. Muta e devolve o mesmo Set (usedNames), pra ser chamado
// em sequência sobre uma lista inteira.
export function uniqueName(usedNames: Set<string>, filename: string) {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let n = 2;
  let candidate = `${base}_${n}${ext}`;
  while (usedNames.has(candidate)) {
    n++;
    candidate = `${base}_${n}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}
