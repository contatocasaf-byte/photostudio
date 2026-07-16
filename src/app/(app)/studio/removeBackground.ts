import { getUploadUrl } from "./actions";

export type RemoveBackgroundResult = {
  originalKey: string; // upload cru, antes de remover o fundo — o editor usa
  // pra restaurar cor de verdade com o lápis, já que o resultado
  // processado tem RGB zerado onde o rembg removeu.
  resultKey: string;
};

// Sobe um arquivo pro R2 (URL presignada) e chama o backend pra remover o
// fundo. Usado tanto pelo modo individual quanto pelo lote — mesmos dois
// passos, só muda quem itera sobre a lista de arquivos.
export async function removeBackgroundForFile(file: File): Promise<RemoveBackgroundResult> {
  const { url, filePath, error: uploadError } = await getUploadUrl({
    fileName: file.name,
    contentType: file.type,
  });
  if (uploadError || !url || !filePath) throw new Error(uploadError ?? "Falha ao gerar URL de upload.");

  const putRes = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) throw new Error("Falha no upload pro R2.");

  const res = await fetch("/api/remove-background", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: filePath }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Falha ao remover fundo.");

  return { originalKey: filePath, resultKey: data.resultKey as string };
}
