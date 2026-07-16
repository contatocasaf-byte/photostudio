import type { LazyFileEntry } from "@/components/FolderPickerZone";

export const PRODUCT_PHOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

function stemOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Procura CODIGO_N.ext (menor N primeiro) entre os itens listados de
// uma pasta (ver FolderPickerZone); fallback pra CODIGO.ext exato.
// Porta encontrar_foto_produto (core.py:127-150 do Gerador de Ofertas
// original) — reaproveitada tanto no Gerador de Ofertas quanto no
// Aplicador de Marca do Studio, por isso mora num local compartilhado
// (é utilidade genérica de arquivo, não lógica de negócio de nenhum
// dos dois módulos).
export function findFileByCode(entries: LazyFileEntry[], codigo: string): LazyFileEntry | null {
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
