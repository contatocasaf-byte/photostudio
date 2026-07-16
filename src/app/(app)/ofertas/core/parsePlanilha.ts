// Porta load_excel/_col_codigo/_extrair_linha/buscar_produto (core.py:37-91)
// pra parse client-side com xlsx (SheetJS) — sem tabela `products` nem
// upload pro servidor nessa entrega (ver plano, seção "Fase 3"): a
// planilha fica só na memória da sessão do navegador.
import * as XLSX from "xlsx";

export type ProdutoRow = {
  codigo: string;
  ref: string;
  desc: string;
  precoSp: string;
  precoPa: string;
};

function normalizeHeader(h: unknown): string {
  return String(h).trim().toUpperCase();
}

function findColCodigo(headers: string[]): string | null {
  const exact = headers.find((c) => c === "COD" || c === "CODIGO" || c === "CÓDIGO");
  if (exact) return exact;
  return headers.find((c) => c.includes("COD")) ?? null;
}

// Procura o primeiro candidato de nome de coluna (exato ou substring)
// que tenha um valor não-vazio nessa linha — mesma lógica flexível do
// app original (colunas "REF"/"REFERÊNCIA"/"REFERENCIA" etc. todas
// aceitas).
function getCol(normalizedRow: Record<string, unknown>, headers: string[], candidates: string[]): string {
  for (const cand of candidates) {
    for (const c of headers) {
      if (c === cand || c.includes(cand)) {
        const val = String(normalizedRow[c] ?? "").trim();
        if (val && val.toLowerCase() !== "nan") return val;
      }
    }
  }
  return "";
}

export async function parsePlanilha(file: File): Promise<ProdutoRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
  if (rows.length === 0) return [];

  // sheet_to_json usa os headers ORIGINAIS (sem normalizar) como chave
  // de cada linha — monta um mapa normalizado->original pra reusar em
  // toda linha.
  const headerMap = new Map<string, string>();
  for (const orig of Object.keys(rows[0])) headerMap.set(normalizeHeader(orig), orig);
  const headers = [...headerMap.keys()];

  const colCodigoNorm = findColCodigo(headers);
  if (!colCodigoNorm) return [];
  const colCodigoOrig = headerMap.get(colCodigoNorm)!;

  const produtos: ProdutoRow[] = [];
  for (const row of rows) {
    const codigo = String(row[colCodigoOrig] ?? "").trim();
    if (!codigo || codigo.toLowerCase() === "nan") continue;

    const normalizedRow: Record<string, unknown> = {};
    for (const [normKey, origKey] of headerMap) normalizedRow[normKey] = row[origKey];

    produtos.push({
      codigo,
      ref: getCol(normalizedRow, headers, ["REF", "REFERÊNCIA", "REFERENCIA"]),
      desc: getCol(normalizedRow, headers, ["DESCRIÇÃO", "DESCRICAO", "DESC"]),
      precoSp: getCol(normalizedRow, headers, ["PREÇO SP", "PRECO SP", "SP"]),
      precoPa: getCol(normalizedRow, headers, ["PREÇO PA", "PRECO PA", "PA"]),
    });
  }
  return produtos;
}

// Busca por código ignorando zeros à esquerda (mesma regra do
// original: "0020502" e "20502" são o mesmo produto).
export function buscarProduto(produtos: ProdutoRow[], codigo: string): ProdutoRow | null {
  const code = codigo.trim().replace(/^0+/, "");
  return produtos.find((p) => p.codigo.trim().replace(/^0+/, "") === code) ?? null;
}
