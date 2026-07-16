// Porta encontrar_foto_produto (core.py:127-150): procura CODIGO_N.ext
// (menor N primeiro) na pasta de fotos selecionada; fallback pra
// CODIGO.ext exato. Opera sobre os nomes já listados pelo
// FolderPickerZone (LazyFileEntry) — só lê o arquivo de fato (getFile())
// pro item encontrado, nunca pra pasta inteira.
import type { LazyFileEntry } from "@/components/FolderPickerZone";

export const PRODUCT_PHOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

function stemOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function encontrarFotoProduto(entries: LazyFileEntry[], codigo: string): LazyFileEntry | null {
  const code = codigo.trim();
  if (!code) return null;

  const pattern = new RegExp(`^${escapeRegExp(code)}_(\\d+)$`);
  const candidatos: { n: number; entry: LazyFileEntry }[] = [];
  for (const e of entries) {
    const m = stemOf(e.name).match(pattern);
    if (m) candidatos.push({ n: parseInt(m[1], 10), entry: e });
  }
  if (candidatos.length > 0) {
    candidatos.sort((a, b) => a.n - b.n);
    return candidatos[0].entry;
  }

  for (const ext of PRODUCT_PHOTO_EXTS) {
    const alvo = (code + ext).toLowerCase();
    const match = entries.find((e) => e.name.toLowerCase() === alvo);
    if (match) return match;
  }
  return null;
}
