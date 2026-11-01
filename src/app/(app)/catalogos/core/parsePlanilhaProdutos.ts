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

// Maiúsculas e SEM acento (CÓD = COD, PREÇO = PRECO): os candidatos abaixo
// também passam por aqui, então a planilha pode vir com ou sem acento. O
// replace remove as marcas de acento (intervalo U+0300–U+036F) que o NFD separa.
function normalizeHeader(h: unknown): string {
  return String(h)
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function findColCodigo(headers: string[]): string | null {
  const exact = headers.find((c) => c === "COD" || c === "CODIGO");
  if (exact) return exact;
  return headers.find((c) => c.includes("COD")) ?? null;
}

// Procura o primeiro candidato de nome de coluna (exato ou substring)
// que tenha um valor não-vazio nessa linha.
function getCol(normalizedRow: Record<string, unknown>, headers: string[], candidates: string[]): string {
  for (const cand of candidates.map(normalizeHeader)) {
    for (const c of headers) {
      if (c === cand || c.includes(cand)) {
        const val = String(normalizedRow[c] ?? "").trim();
        if (val && val.toLowerCase() !== "nan") return val;
      }
    }
  }
  return "";
}

function parseAba(sheet: XLSX.WorkSheet): ProdutoImportRow[] {
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

// Lê TODAS as abas e fica com a que serve: planilha com mais de uma aba é
// comum (ex.: uma aba "Report" só com código/descrição e outra com os
// preços), e olhar só a primeira falhava. Vale a aba que tem preço
// preenchido; entre as que empatam nisso, a com mais produtos (a primeira
// vence o empate final). Planilha de uma aba só se comporta como antes.
export async function parsePlanilhaProdutos(file: File): Promise<ProdutoImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  let melhor: ProdutoImportRow[] = [];
  let melhorPontos = -1;
  for (const nome of wb.SheetNames) {
    const produtos = parseAba(wb.Sheets[nome]);
    if (produtos.length === 0) continue;
    const temPreco = produtos.some((p) => p.preco1 !== "" || p.preco2 !== "");
    const pontos = (temPreco ? 1_000_000 : 0) + produtos.length;
    if (pontos > melhorPontos) {
      melhor = produtos;
      melhorPontos = pontos;
    }
  }
  return melhor;
}
