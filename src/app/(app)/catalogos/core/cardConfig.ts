// Modelo do card-molde de uma seção (spec seção 3.1, CardTemplate).
// Conjunto de campos FIXO e enumerado (não um construtor de campos
// genérico) — mesma granularidade dos 8 elementos fixos do Editor de
// Layout do Gerador de Ofertas. Sem produtos reais ainda (tabela
// `products` populada é uma fase futura), cada campo de texto tem um
// valor de exemplo (`sampleText`) usado no preview WYSIWYG do editor.
import type { TextAlign } from "@/lib/canvasText";

// Campos 1:1 com as colunas reais de `products` (Parte 4: codigo, ref,
// descricao, preco_1, preco_2, foto_key) — sem inventar campo que não
// existe no dado real (versão anterior tinha "nome"/"sku"/um "preco"
// só, que não correspondiam a nenhuma coluna da planilha de catálogo;
// corrigido na Parte 6a, antes do motor de reflow precisar substituir
// dado real nesses campos).
export type CardFieldKey = "foto" | "codigo" | "ref" | "descricao" | "preco_1" | "preco_2";
export type CardFieldType = "image" | "text";

export type CardFieldDef = {
  key: CardFieldKey;
  label: string;
  type: CardFieldType;
  sampleText: string | null;
};

export const CARD_FIELD_DEFS: CardFieldDef[] = [
  { key: "foto", label: "Foto do Produto", type: "image", sampleText: null },
  { key: "codigo", label: "Código", type: "text", sampleText: "00000" },
  { key: "ref", label: "Referência", type: "text", sampleText: "Referência do Produto" },
  {
    key: "descricao",
    label: "Descrição",
    type: "text",
    sampleText: "Descrição breve do produto, podendo ocupar até três linhas.",
  },
  { key: "preco_1", label: "Preço 1", type: "text", sampleText: "R$ 99,90" },
  { key: "preco_2", label: "Preço 2", type: "text", sampleText: "R$ 109,90" },
];

// Todo campo de texto aceita um rótulo fixo em volta do `{valor}` real
// do produto (ex.: trocar "Preço 1" por "À vista: {valor}" ou só
// "{valor}", sem rótulo nenhum) — mesmo mecanismo de template +
// placeholder já usado no editor de página (`text` + substitutePlaceholders).
export function substitutePlaceholders(template: string, valor: string): string {
  return template.replace(/\{valor\}/g, valor);
}

export type CardImageElementConfig = { x: number; y: number; w: number; h: number };
export type CardTextElementConfig = {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  maxW: number;
  color: string;
  fontWeight: "bold" | "normal";
  align: TextAlign;
  maxLines: number;
};
export type CardElementConfig = Partial<CardImageElementConfig & CardTextElementConfig>;
export type CardLayout = Record<CardFieldKey, CardElementConfig>;

export const DEFAULT_CARD_WIDTH = 300;
export const DEFAULT_CARD_HEIGHT = 380;

export const DEFAULT_CAMPOS_HABILITADOS: CardFieldKey[] = ["foto", "codigo", "ref", "descricao", "preco_1", "preco_2"];

// Posições de partida razoáveis pra um card em branco — diferente do
// Editor de Layout do Ofertas (que deriva posições em FRAÇÃO do
// tamanho de um arquivo de layout já existente), aqui não há nenhum
// arquivo de referência: o card nasce do zero e o usuário
// arrasta/redimensiona tudo a partir daqui.
export function defaultCardLayout(width: number = DEFAULT_CARD_WIDTH, height: number = DEFAULT_CARD_HEIGHT): CardLayout {
  const margin = Math.round(width * 0.05);
  const contentW = width - margin * 2;
  const fotoH = Math.round(height * 0.5);
  const textStartY = margin + fotoH + 12;
  const gap = 10;
  const halfW = Math.round((contentW - gap) / 2);

  return {
    foto: { x: margin, y: margin, w: contentW, h: fotoH },
    codigo: {
      x: margin,
      y: textStartY,
      text: "{valor}",
      fontSize: 11,
      maxW: contentW,
      color: "#888888",
      fontWeight: "normal",
      align: "left",
      maxLines: 1,
    },
    ref: {
      x: margin,
      y: textStartY + 16,
      text: "{valor}",
      fontSize: 16,
      maxW: contentW,
      color: "#1a1a1a",
      fontWeight: "bold",
      align: "left",
      maxLines: 1,
    },
    descricao: {
      x: margin,
      y: textStartY + 42,
      text: "{valor}",
      fontSize: 12,
      maxW: contentW,
      color: "#444444",
      fontWeight: "normal",
      align: "left",
      maxLines: 3,
    },
    preco_1: {
      x: margin,
      y: textStartY + 98,
      text: "Preço 1: {valor}",
      fontSize: 18,
      maxW: halfW,
      color: "#c0392b",
      fontWeight: "bold",
      align: "left",
      maxLines: 1,
    },
    preco_2: {
      x: margin + halfW + gap,
      y: textStartY + 98,
      text: "Preço 2: {valor}",
      fontSize: 18,
      maxW: halfW,
      color: "#ff6b35",
      fontWeight: "bold",
      align: "left",
      maxLines: 1,
    },
  };
}
