// Modelo do card-molde de uma seção (spec seção 3.1, CardTemplate).
// Conjunto de campos FIXO e enumerado (não um construtor de campos
// genérico) — mesma granularidade dos 8 elementos fixos do Editor de
// Layout do Gerador de Ofertas. Sem produtos reais ainda (tabela
// `products` populada é uma fase futura), cada campo de texto tem um
// valor de exemplo (`sampleText`) usado no preview WYSIWYG do editor.
import type { TextAlign } from "@/lib/canvasText";

export type CardFieldKey = "foto" | "nome" | "preco" | "sku" | "descricao";
export type CardFieldType = "image" | "text";

export type CardFieldDef = {
  key: CardFieldKey;
  label: string;
  type: CardFieldType;
  sampleText: string | null;
};

export const CARD_FIELD_DEFS: CardFieldDef[] = [
  { key: "foto", label: "Foto do Produto", type: "image", sampleText: null },
  { key: "nome", label: "Nome", type: "text", sampleText: "Nome do Produto" },
  { key: "preco", label: "Preço", type: "text", sampleText: "R$ 99,90" },
  { key: "sku", label: "SKU", type: "text", sampleText: "SKU 00000" },
  {
    key: "descricao",
    label: "Descrição",
    type: "text",
    sampleText: "Descrição breve do produto, podendo ocupar até três linhas.",
  },
];

export type CardImageElementConfig = { x: number; y: number; w: number; h: number };
export type CardTextElementConfig = {
  x: number;
  y: number;
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

export const DEFAULT_CAMPOS_HABILITADOS: CardFieldKey[] = ["foto", "nome", "preco", "sku", "descricao"];

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

  return {
    foto: { x: margin, y: margin, w: contentW, h: fotoH },
    nome: {
      x: margin,
      y: textStartY,
      fontSize: 16,
      maxW: contentW,
      color: "#1a1a1a",
      fontWeight: "bold",
      align: "left",
      maxLines: 1,
    },
    preco: {
      x: margin,
      y: textStartY + 26,
      fontSize: 20,
      maxW: contentW,
      color: "#c0392b",
      fontWeight: "bold",
      align: "left",
      maxLines: 1,
    },
    sku: {
      x: margin,
      y: textStartY + 58,
      fontSize: 11,
      maxW: contentW,
      color: "#888888",
      fontWeight: "normal",
      align: "left",
      maxLines: 1,
    },
    descricao: {
      x: margin,
      y: textStartY + 78,
      fontSize: 12,
      maxW: contentW,
      color: "#444444",
      fontWeight: "normal",
      align: "left",
      maxLines: 3,
    },
  };
}
