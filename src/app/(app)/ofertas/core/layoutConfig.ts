// Porta ELEMENT_DEFS, DEFAULT_LAYOUT_CONFIG_FRAC, _default_config_for_size
// (core.py:176-231). Posições padrão em FRAÇÃO do tamanho do layout
// (0.0-1.0) — funciona pra layout quadrado ou vertical sem saber o
// tamanho de antemão. "font" do app original (arquivo .ttf) vira
// `fontWeight` aqui: sem biblioteca de fontes ainda (isso é a Fase 4b),
// o render usa fonte do sistema via `font-family` do Canvas, só
// precisando saber se é bold ou normal.
//
// Fase 4a: o texto de cada elemento (`text`) NÃO é mais fixo no código
// (no original, "Preço SP"/"Preço PA"/etc. estavam hardcoded dentro de
// render_canvas, nem eram lidos da config) — agora é um TEMPLATE
// editável no Editor de Layout, com placeholders substituídos na hora
// de gerar (ver substitutePlaceholders). Isso é o que permite o usuário
// trocar o rótulo "Preço SP" por "DE", por exemplo.

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

// Placeholders disponíveis pra cada elemento de texto, mostrados como
// dica no Editor de Layout — nem todo elemento precisa usar o seu (ex:
// label_sp_pos pode virar texto puro "DE", sem placeholder nenhum).
export const ELEMENT_PLACEHOLDERS: Partial<Record<ElementKey, string[]>> = {
  ref_pos: ["{ref}"],
  desc_pos: ["{desc}"],
  price_sp_pos: ["{preco_sp}"],
  price_pa_pos: ["{preco_pa}"],
  validity_pos: ["{data_ini}", "{data_fim}"],
};

export type ImageElementConfig = { x: number; y: number; w: number; h: number };
export type TextElementConfig = {
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
export type ElementConfig = Partial<ImageElementConfig & TextElementConfig>;
export type LayoutConfig = Record<ElementKey, ElementConfig>;

const RIGHT_MARGIN_FRAC = 0.05;

type FracImageBox = { x: number; y: number; w: number; h: number };
type FracText = {
  x: number;
  y: number;
  text: string;
  fontSizeFrac: number;
  color: string;
  fontWeight: "bold" | "normal";
  align: TextAlign;
  maxLines: number;
};

const DEFAULT_LAYOUT_CONFIG_FRAC: Record<ElementKey, FracImageBox | FracText> = {
  product_box: { x: 0.07, y: 0.1, w: 0.55, h: 0.45 },
  ref_pos: {
    x: 0.68,
    y: 0.11,
    text: "Ref: {ref}",
    fontSizeFrac: 0.026,
    color: "#FFFFFF",
    fontWeight: "bold",
    align: "left",
    maxLines: 1,
  },
  desc_pos: {
    x: 0.68,
    y: 0.155,
    text: "{desc}",
    fontSizeFrac: 0.02,
    color: "#FFFFFF",
    fontWeight: "normal",
    align: "left",
    maxLines: 2,
  },
  label_sp_pos: {
    x: 0.68,
    y: 0.36,
    text: "Preço SP",
    fontSizeFrac: 0.018,
    color: "#CCCCCC",
    fontWeight: "normal",
    align: "left",
    maxLines: 1,
  },
  price_sp_pos: {
    x: 0.68,
    y: 0.39,
    text: "R$ {preco_sp}",
    fontSizeFrac: 0.067,
    color: "#FFD700",
    fontWeight: "bold",
    align: "left",
    maxLines: 1,
  },
  label_pa_pos: {
    x: 0.68,
    y: 0.455,
    text: "Preço PA",
    fontSizeFrac: 0.018,
    color: "#CCCCCC",
    fontWeight: "normal",
    align: "left",
    maxLines: 1,
  },
  price_pa_pos: {
    x: 0.68,
    y: 0.485,
    text: "R$ {preco_pa}",
    fontSizeFrac: 0.067,
    color: "#FF6B35",
    fontWeight: "bold",
    align: "left",
    maxLines: 1,
  },
  validity_pos: {
    x: 0.68,
    y: 0.6,
    text: "Válido de {data_ini} até {data_fim}",
    fontSizeFrac: 0.018,
    color: "#AAAAAA",
    fontWeight: "normal",
    align: "left",
    maxLines: 1,
  },
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
      entry.text = c.text;
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

// Substitui {placeholder} pelo valor correspondente — placeholder sem
// valor conhecido fica como está (não quebra o texto).
export function substitutePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

// Mescla a config salva (parcial, só o que o usuário mudou) por cima
// dos padrões — merge RASO por propriedade dentro de cada elemento
// (não troca o elemento inteiro), replica get_layout_config
// (core.py:263-276).
export function mergeConfig(defaults: LayoutConfig, saved: Partial<Record<ElementKey, ElementConfig>> | null): LayoutConfig {
  if (!saved) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(saved) as ElementKey[]) {
    const val = saved[key];
    if (!val) continue;
    result[key] = { ...result[key], ...val };
  }
  return result;
}

// Mesmo nome do arquivo de layout, trocando a extensão por .json —
// replica layout_config_path (core.py:248-250), só que a "pasta" é um
// prefixo de bucket R2 em vez de disco local.
export function layoutConfigKey(imageKey: string): string {
  const dot = imageKey.lastIndexOf(".");
  const base = dot > 0 ? imageKey.slice(0, dot) : imageKey;
  return `${base}.json`;
}
