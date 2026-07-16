// Porta encontrar_foto_produto (core.py:127-150): procura CODIGO_N.ext
// (menor N primeiro) na pasta de fotos selecionada; fallback pra
// CODIGO.ext exato. Opera sobre a lista de File já filtrada pra só os
// arquivos diretamente dentro da pasta (mesma regra não-recursiva do
// Comparador de Pastas do Studio).
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function extOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function stemOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function directChildrenImages(files: FileList): File[] {
  return Array.from(files).filter((f) => {
    const rel = f.webkitRelativePath;
    if (rel && rel.split("/").length !== 2) return false;
    return IMG_EXTS.has(extOf(f.name));
  });
}

export function encontrarFotoProduto(files: File[], codigo: string): File | null {
  const code = codigo.trim();
  if (!code) return null;

  const pattern = new RegExp(`^${escapeRegExp(code)}_(\\d+)$`);
  const candidatos: { n: number; file: File }[] = [];
  for (const f of files) {
    const m = stemOf(f.name).match(pattern);
    if (m) candidatos.push({ n: parseInt(m[1], 10), file: f });
  }
  if (candidatos.length > 0) {
    candidatos.sort((a, b) => a.n - b.n);
    return candidatos[0].file;
  }

  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const alvo = (code + ext).toLowerCase();
    const match = files.find((f) => f.name.toLowerCase() === alvo);
    if (match) return match;
  }
  return null;
}
