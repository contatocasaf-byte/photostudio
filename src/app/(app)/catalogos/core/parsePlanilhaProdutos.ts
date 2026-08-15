// Parser de planilha de PRODUTOS do Criador de Catálogos — mesma ideia
// de correspondência flexível de coluna já usada em
// ofertas/core/parsePlanilha.ts, mas com candidatos de coluna de preço
// diferentes ("PREÇO 1"/"PREÇO 2", não "PREÇO SP"/"PREÇO PA") e tipo de
// retorno próprio. Implementação independente (não compartilhada com o
// parser do Ofertas, já em produção e estável) — ver decisão na Parte
// 4 do plano.
import * as XLSX from "xlsx";

export type ProdutoImportRow = {
  codigo: string;
  ref: string;
  desc: string;
  preco1: string;
  preco2: string;
  // Compartilhado entre Catálogos ("Múltiplos") e Jornal de Ofertas
  // ("Quantidade mínima") — mesma coluna/dado, só o texto do card-molde
  // (editável por seção) muda de legenda entre os dois módulos.
  quantidadeMinima: string;
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
// que tenha um valor não-vazio nessa linha.
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

export async function parsePlanilhaProdutos(file: File): Promise<ProdutoImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
  if (rows.length === 0) return [];

  const headerMap = new Map<string, string>();
  for (const orig of Object.keys(rows[0])) headerMap.set(normalizeHeader(orig), orig);
  const headers = [...headerMap.keys()];

  const colCodigoNorm = findColCodigo(headers);
  if (!colCodigoNorm) return [];
  const colCodigoOrig = headerMap.get(colCodigoNorm)!;

  const produtos: ProdutoImportRow[] = [];
  for (const row of rows) {
    const codigo = String(row[colCodigoOrig] ?? "").trim();
    if (!codigo || codigo.toLowerCase() === "nan") continue;

    const normalizedRow: Record<string, unknown> = {};
    for (const [normKey, origKey] of headerMap) normalizedRow[normKey] = row[origKey];

    produtos.push({
      codigo,
      ref: getCol(normalizedRow, headers, ["REF", "REFERÊNCIA", "REFERENCIA"]),
      desc: getCol(normalizedRow, headers, ["DESCRIÇÃO", "DESCRICAO", "DESC"]),
      preco1: getCol(normalizedRow, headers, ["PREÇO 1", "PRECO 1", "PREÇO1", "PRECO1"]),
      preco2: getCol(normalizedRow, headers, ["PREÇO 2", "PRECO 2", "PREÇO2", "PRECO2"]),
      quantidadeMinima: getCol(normalizedRow, headers, [
        "QUANTIDADE MÍNIMA",
        "QUANTIDADE MINIMA",
        "QTD MÍNIMA",
        "QTD MINIMA",
        "QTD MIN",
        "MÚLTIPLO",
        "MULTIPLO",
        "MULTIPLOS",
      ]),
    });
  }
  return produtos;
}
