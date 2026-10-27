import type { Workbook, Worksheet } from "exceljs";

// Identidade visual das planilhas Brasmam — copiada da planilha do
// catálogo ZENOAH G5200 (Documentos\Catálogos\VISTAS EXPLODIDAS\ZENOAH):
// faixa preta no topo com a logomarca BRASMAM (branca) à esquerda e o
// título à direita, filete vermelho embaixo, títulos em Bahnschrift
// SemiBold Condensed, texto em Segoe UI, cabeçalho de tabela preto com
// letras brancas, linhas separadas por filete cinza, links em vermelho
// sublinhado, sem linhas de grade. Usa ExcelJS (a SheetJS gratuita não
// grava cor/fonte/imagem). ExcelJS é carregado só na hora de gerar
// (import dinâmico) pra não pesar no resto do sistema.

export const COR = {
  escuro: "FF1A1A1A",
  vermelho: "FFD01C03",
  cinza: "FF6B6B6B",
  linha: "FFD9D9D9",
  fundoLeve: "FFF4F4F4",
  branco: "FFFFFFFF",
} as const;

export const FONTE = { titulo: "Bahnschrift SemiBold Condensed", texto: "Segoe UI" } as const;

const LOGO_URL = "/brand/brasmam-logo-branco.png";
const LOGO_LARGURA_PX = 156;
const LOGO_ALTURA_PX = 40;
const ALTURA_LINHA = 19.95;

export type Alinhamento = "left" | "center" | "right";
export type Coluna = { titulo: string; largura: number; alinhar: Alinhamento };
// Célula de dados: texto simples, ou texto + link (vermelho sublinhado),
// ou texto "apagado" (cinza, ex.: "sem foto").
export type Celula = string | { texto: string; url?: string; apagado?: boolean };

export async function logoBase64(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  } catch {
    return null; // sem logomarca a planilha sai igual, só sem a imagem
  }
}

export async function novaPasta(): Promise<Workbook> {
  const mod = await import("exceljs");
  const Pasta = mod.Workbook ?? (mod as unknown as { default: { Workbook: typeof mod.Workbook } }).default.Workbook;
  const workbook = new Pasta();
  workbook.creator = "Suite Brasmam";
  workbook.created = new Date();
  return workbook;
}

// Nova aba já com a faixa do topo (linhas 1-2): fundo preto em toda a
// largura, logomarca à esquerda, texto da faixa à direita e filete
// vermelho embaixo.
export function novaAba(
  workbook: Workbook,
  opts: { nome: string; colunas: Coluna[]; textoFaixa: string; logo: string | null; abaClara?: boolean }
): Worksheet {
  const { nome, colunas, textoFaixa, logo } = opts;
  const ws = workbook.addWorksheet(nome, {
    properties: { tabColor: { argb: opts.abaClara ? COR.escuro : COR.vermelho }, defaultRowHeight: ALTURA_LINHA },
    views: [{ showGridLines: false, zoomScale: 85 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  colunas.forEach((c, i) => (ws.getColumn(i + 1).width = c.largura));

  const ultima = colunas.length;
  for (const linha of [1, 2]) {
    ws.getRow(linha).height = ALTURA_LINHA;
    for (let c = 1; c <= ultima; c++) {
      const cel = ws.getCell(linha, c);
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.escuro } };
      if (linha === 2) cel.border = { bottom: { style: "medium", color: { argb: COR.vermelho } } };
    }
  }
  // Texto da faixa à direita (mescla as colunas à direita da logomarca).
  const inicioTexto = Math.min(3, ultima);
  ws.mergeCells(1, inicioTexto, 2, ultima);
  const faixa = ws.getCell(1, inicioTexto);
  faixa.value = textoFaixa;
  faixa.font = { name: FONTE.titulo, size: 13, color: { argb: COR.branco } };
  faixa.alignment = { horizontal: "right", vertical: "middle" };
  faixa.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.escuro } };
  faixa.border = { bottom: { style: "medium", color: { argb: COR.vermelho } } };

  if (logo) {
    const id = workbook.addImage({ base64: logo, extension: "png" });
    // Recuo em EMU idêntico ao da ZENOAH (76200 = 8px à esquerda, 66675 = ~7px do topo).
    ws.addImage(id, {
      tl: { nativeCol: 0, nativeColOff: 76200, nativeRow: 0, nativeRowOff: 66675 } as unknown as { col: number; row: number },
      ext: { width: LOGO_LARGURA_PX, height: LOGO_ALTURA_PX },
    });
  }
  return ws;
}

// Linha de título (Bahnschrift 16) com texto de destaque opcional à
// direita (Segoe UI 9 negrito vermelho) e uma nota cinza logo abaixo.
export function escreverTitulo(ws: Worksheet, linha: number, titulo: string, destaqueDireita?: string, nota?: string) {
  const ultima = ws.columnCount;
  ws.getRow(linha).height = ALTURA_LINHA;
  const t = ws.getCell(linha, 1);
  t.value = titulo;
  t.font = { name: FONTE.titulo, size: 16, color: { argb: COR.escuro } };
  t.alignment = { vertical: "middle" };

  if (destaqueDireita) {
    const d = ws.getCell(linha, ultima);
    d.value = destaqueDireita;
    d.font = { name: FONTE.texto, size: 9, bold: true, color: { argb: COR.vermelho } };
    d.alignment = { horizontal: "right", vertical: "middle" };
  }
  if (nota) {
    ws.getRow(linha + 1).height = ALTURA_LINHA;
    const n = ws.getCell(linha + 1, 1);
    n.value = nota;
    n.font = { name: FONTE.texto, size: 9, color: { argb: COR.cinza } };
    n.alignment = { vertical: "middle" };
  }
}

// Tabela: cabeçalho preto (Bahnschrift 11, letras brancas) + linhas de
// dados. Primeira coluna em destaque (negrito sobre fundo cinza claro,
// como a coluna ITEM do ZENOAH). Devolve a linha do cabeçalho.
export function escreverTabela(ws: Worksheet, linhaCabecalho: number, colunas: Coluna[], linhas: Celula[][]): number {
  ws.getRow(linhaCabecalho).height = ALTURA_LINHA;
  colunas.forEach((c, i) => {
    const cel = ws.getCell(linhaCabecalho, i + 1);
    cel.value = c.titulo.toLocaleUpperCase("pt-BR");
    cel.font = { name: FONTE.titulo, size: 11, bold: true, color: { argb: COR.branco } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.escuro } };
    cel.alignment = { horizontal: c.alinhar, vertical: "middle" };
  });

  linhas.forEach((linha, r) => {
    const numero = linhaCabecalho + 1 + r;
    linha.forEach((valor, i) => {
      const cel = ws.getCell(numero, i + 1);
      const c = colunas[i];
      const texto = typeof valor === "string" ? valor : valor.texto;
      const url = typeof valor === "string" ? undefined : valor.url;
      const apagado = typeof valor === "string" ? false : !!valor.apagado;

      if (url) {
        cel.value = { text: texto, hyperlink: url, tooltip: "Abrir as fotos deste código" };
        cel.font = { name: FONTE.texto, size: 9, bold: true, underline: true, color: { argb: COR.vermelho } };
      } else {
        cel.value = texto;
        cel.font = apagado
          ? { name: FONTE.texto, size: 9, color: { argb: COR.cinza } }
          : { name: FONTE.texto, size: 10, bold: i === 0, color: { argb: COR.escuro } };
      }
      if (i === 0) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.fundoLeve } };
      cel.alignment = { horizontal: c.alinhar, vertical: "middle", wrapText: c.alinhar === "left" && i >= 2 };
      cel.border = { bottom: { style: "thin", color: { argb: COR.linha } } };
    });
  });

  const ultimaLinha = linhaCabecalho + linhas.length;
  ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: Math.max(ultimaLinha, linhaCabecalho), column: colunas.length } };
  // Cabeçalho congelado (rola só a tabela) e repetido em cada página impressa.
  ws.views = [{ showGridLines: false, zoomScale: 85, state: "frozen", ySplit: linhaCabecalho }];
  ws.pageSetup.printTitlesRow = `${linhaCabecalho}:${linhaCabecalho}`;
  return linhaCabecalho;
}

export async function paraBlob(workbook: Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function nomeArquivoSeguro(nome: string, padrao = "catalogo"): string {
  return (nome.trim() || padrao).replace(/[\\/:*?"<>|]+/g, " ").trim();
}
