// Porta ELEMENT_DEFS, DEFAULT_LAYOUT_CONFIG_FRAC, _default_config_for_size
// (core.py:176-231). Posições padrão em FRAÇÃO do tamanho do layout
// (0.0-1.0) — funciona pra layout quadrado ou vertical sem saber o
// tamanho de antemão. "font" do app original (arquivo .ttf) vira
// `fontWeight` aqui: sem biblioteca de fontes ainda (isso é a Fase 4),
// o render usa fonte do sistema via `font-family` do Canvas, só
// precisando saber se é bold ou normal.

export type ElementKey =
  | "product_box"
  | "ref_pos"
  | "desc_pos"
  | "label_sp_pos"
  | "price_sp_pos"
  | "label_pa_pos"
  | "price_pa_pos"
  | "validity_pos";

export type ElementType = "image" | "text";
export type TextAlign = "left" | "center" | "right" | "justify";

export type ElementDef = {
  key: ElementKey;
  label: string;
  type: ElementType;
  defaultText: string | null;
};

export const ELEMENT_DEFS: ElementDef[] = [
  { key: "product_box", label: "Foto do Produto", type: "image", defaultText: null },
  { key: "ref_pos", label: "Referência", type: "text", defaultText: "Ref: 0000" },
  { key: "desc_pos", label: "Descrição", type: "text", defaultText: "Descrição do produto" },
  { key: "label_sp_pos", label: "Rótulo 'Preço SP'", type: "text", defaultText: "Preço SP" },
  { key: "price_sp_pos", label: "Valor Preço SP", type: "text", defaultText: "R$ 99,90" },
  { key: "label_pa_pos", label: "Rótulo 'Preço PA'", type: "text", defaultText: "Preço PA" },
  { key: "price_pa_pos", label: "Valor Preço PA", type: "text", defaultText: "R$ 109,90" },
  { key: "validity_pos", label: "Validade", type: "text", defaultText: "Válido de 01/01/2026 até 31/01/2026" },
];

export type ImageElementConfig = { x: number; y: number; w: number; h: number };
export type TextElementConfig = {
  x: number;
  y: number;
  fontSize: number;
  maxW: number;
  color: string;
  fontWeight: "bold" | "normal";
  align: TextAlign;
  maxLines: number;
};
export type ElementConfig = Partial<ImageElementConfig & TextElementConfig>;
export type LayoutConfig = Record<ElementKey, ElementConfig>;

const RIGHT_MARGIN_FRAC = 0.05;

type FracImageBox = { x: number; y: number; w: number; h: number };
type FracText = {
  x: number;
  y: number;
  fontSizeFrac: number;
  color: string;
  fontWeight: "bold" | "normal";
  align: TextAlign;
  maxLines: number;
};

const DEFAULT_LAYOUT_CONFIG_FRAC: Record<ElementKey, FracImageBox | FracText> = {
  product_box: { x: 0.07, y: 0.1, w: 0.55, h: 0.45 },
  ref_pos: { x: 0.68, y: 0.11, fontSizeFrac: 0.026, color: "#FFFFFF", fontWeight: "bold", align: "left", maxLines: 1 },
  desc_pos: { x: 0.68, y: 0.155, fontSizeFrac: 0.02, color: "#FFFFFF", fontWeight: "normal", align: "left", maxLines: 2 },
  label_sp_pos: { x: 0.68, y: 0.36, fontSizeFrac: 0.018, color: "#CCCCCC", fontWeight: "normal", align: "left", maxLines: 1 },
  price_sp_pos: { x: 0.68, y: 0.39, fontSizeFrac: 0.067, color: "#FFD700", fontWeight: "bold", align: "left", maxLines: 1 },
  label_pa_pos: { x: 0.68, y: 0.455, fontSizeFrac: 0.018, color: "#CCCCCC", fontWeight: "normal", align: "left", maxLines: 1 },
  price_pa_pos: { x: 0.68, y: 0.485, fontSizeFrac: 0.067, color: "#FF6B35", fontWeight: "bold", align: "left", maxLines: 1 },
  validity_pos: { x: 0.68, y: 0.6, fontSizeFrac: 0.018, color: "#AAAAAA", fontWeight: "normal", align: "left", maxLines: 1 },
};

function isFracText(c: FracImageBox | FracText): c is FracText {
  return "fontSizeFrac" in c;
}

// Converte o template percentual acima em pixels absolutos pro tamanho
// REAL de um layout específico (preserva proporção certa tanto pra
// quadrado quanto pra vertical/horizontal).
export function defaultConfigForSize(width: number, height: number): LayoutConfig {
  const refDim = Math.min(width, height); // tamanho de fonte baseado na menor dimensão (evita texto gigante em layouts muito altos)
  const cfg = {} as LayoutConfig;

  for (const key of Object.keys(DEFAULT_LAYOUT_CONFIG_FRAC) as ElementKey[]) {
    const c = DEFAULT_LAYOUT_CONFIG_FRAC[key];
    const entry: ElementConfig = { x: Math.round(c.x * width), y: Math.round(c.y * height) };

    if (!isFracText(c)) {
      entry.w = Math.round(c.w * width);
      entry.h = Math.round(c.h * height);
    } else {
      entry.fontSize = Math.max(10, Math.round(c.fontSizeFrac * refDim));
      // max_w calculado pra nunca ultrapassar a borda direita da imagem
      const maxWFrac = Math.max(0.1, 1.0 - c.x - RIGHT_MARGIN_FRAC);
      entry.maxW = Math.round(maxWFrac * width);
      entry.color = c.color;
      entry.fontWeight = c.fontWeight;
      entry.align = c.align;
      entry.maxLines = c.maxLines;
    }

    cfg[key] = entry;
  }

  return cfg;
}
