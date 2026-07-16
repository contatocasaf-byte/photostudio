import { getOverwriteUploadUrl } from "../actions";

// Sobe o resultado editado por cima da key já existente (produtos/...png)
// — usado pelo botão "Salvar" do PhotoEditor.
export async function saveEditedImage(key: string, blob: Blob): Promise<void> {
  const { url, error } = await getOverwriteUploadUrl({ key, contentType: "image/png" });
  if (error || !url) throw new Error(error ?? "Falha ao gerar URL de upload.");

  const res = await fetch(url, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": "image/png" },
  });
  if (!res.ok) throw new Error("Falha ao salvar a edição no R2.");
}
