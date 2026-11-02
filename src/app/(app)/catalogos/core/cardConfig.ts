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
// "quantidade_minima" é compartilhado entre Catálogos ("Múltiplos") e
// Jornal de Ofertas ("Quantidade mínima") — mesma coluna de
// `products`, só o texto do campo (editável por seção, ver
// `substitutePlaceholders` abaixo) muda de legenda entre os dois
// módulos. Opcional (fora de DEFAULT_CAMPOS_HABILITADOS) — nem todo
// card precisa dele.
export type CardFieldKey = "foto" | "codigo" | "ref" | "descricao" | "preco_1" | "preco_2" | "quantidade_minima";
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
  { key: "quantidade_minima", label: "Quantidade mínima / Múltiplos", type: "text", sampleText: "20" },
];

// Todo campo de texto aceita um rótulo fixo em volta do `{valor}` real
// do produto (ex.: trocar "Preço 1" por "À vista: {valor}" ou só
// "{valor}", sem rótulo nenhum) — mesmo mecanismo de template +
// placeholder já usado no editor de página (`text` + substitutePlaceholders).
export function substitutePlaceholders(template: string, valor: string): string {
  return template.replace(/\{valor\}/g, valor);
}

// Biblioteca de fontes (Fase 5, Parte 11) — mesma de src/lib/fonts/,
// compartilhada com o Gerador de Ofertas. "Arial" continua o padrão
// (fonte de sistema, sem custo de carregamento) — card-molde salvo
// antes desta parte não tem `fontFamily` gravado, então todo ponto de
// leitura usa `cfg.fontFamily ?? DEFAULT_FONT_FAMILY`, nunca o campo
// direto.
export const DEFAULT_FONT_FAMILY = "Arial";

// Fundo de cor (com transparência) — usado no card inteiro e atrás da foto.
export type CardFundo = { ativo: boolean; cor: string; opacidade: number };

export function defaultCardFundo(): CardFundo {
  return { ativo: false, cor: "#ffffff", opacidade: 1 };
}

export type CardImageElementConfig = {
  x: number;
  y: number;
  w: number;
  h: number;
  // Foto do Produto: fundo atrás dela (útil pra PNG sem fundo) e cantos
  // arredondados (do fundo E da própria foto, que é recortada neles). Ausente =
  // sem fundo / cantos retos (molde salvo antes disto).
  fundo?: CardFundo;
  raio?: number;
  // Id do grupo (ver cardElementos.ts) — só vínculo de seleção/movimento no editor.
  grupo?: string;
};
export type CardTextElementConfig = {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  maxW: number;
  color: string;
  fontFamily: string;
  fontWeight: "bold" | "normal";
  align: TextAlign;
  maxLines: number;
  // Altura da CAIXA do texto no editor (px do card). Ausente = automática
  // (linhas x tamanho da fonte x 1,6, como sempre foi). Só define a área de
  // seleção e a referência pra alinhar/centralizar — o texto continua sendo
  // desenhado a partir do topo da caixa, igual na visualização e no PDF.
  h?: number;
  // Texto livre desligado (marcador da lista de Textos): não aparece no editor,
  // na visualização nem no PDF, mas continua salvo. Ausente = visível.
  oculto?: boolean;
  // Só nos campos de preço: "destacado" desenha o valor inteiro grande, com o
  // "R$" e os centavos menores no alto (ver lib/precoDestacado.ts). Ausente ou
  // "normal" = texto comum, como sempre.
  precoEstilo?: "normal" | "destacado";
  // Id do grupo (ver cardElementos.ts).
  grupo?: string;
};
export type CardElementConfig = Partial<CardImageElementConfig & CardTextElementConfig>;
// Além dos campos fixos, o layout guarda os TEXTOS LIVRES adicionados à mão,
// sob chaves "texto:<id>" (ver cardElementos.ts) — por isso o índice por string.
export type CardLayout = Record<CardFieldKey, CardElementConfig> & { [chave: string]: CardElementConfig };

// Todo par família/peso realmente usado pelos campos de TEXTO de um
// card-molde — usado pra pré-carregar (ensureFontsLoaded, ver
// src/lib/fonts/fontLoader.ts) antes de desenhar, mesmo mecanismo já
// usado no Editor de Layout do Gerador de Ofertas.
export function fontPairsFromCardLayout(layout: CardLayout): { family: string; weight: number }[] {
  // Campos de texto fixos + os textos livres ("texto:<id>", ver cardElementos.ts).
  const cfgs = [
    ...CARD_FIELD_DEFS.filter((d) => d.type === "text").map((d) => layout[d.key] as Partial<CardTextElementConfig> | undefined),
    ...Object.entries(layout)
      .filter(([k]) => k.startsWith("texto:"))
      .map(([, cfg]) => cfg as Partial<CardTextElementConfig>),
  ];
  return cfgs.map((cfg) => ({
    family: cfg?.fontFamily ?? DEFAULT_FONT_FAMILY,
    weight: cfg?.fontWeight === "bold" ? 700 : 400,
  }));
}

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
      fontFamily: DEFAULT_FONT_FAMILY,
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
      fontFamily: DEFAULT_FONT_FAMILY,
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
      fontFamily: DEFAULT_FONT_FAMILY,
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
      fontFamily: DEFAULT_FONT_FAMILY,
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
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: "bold",
      align: "left",
      maxLines: 1,
    },
    quantidade_minima: {
      x: margin,
      y: textStartY + 124,
      text: "Quantidade mínima: {valor}",
      fontSize: 11,
      maxW: contentW,
      color: "#666666",
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: "normal",
      align: "left",
      maxLines: 1,
    },
  };
}

// Formas decorativas — sem vínculo com dado de produto nenhum (por
// isso não são um CardFieldKey, ficam numa lista à parte, tamanho
// livre, não um por card). "Quadrado" não é um tipo próprio: é só um
// retângulo com largura = altura, o usuário ajusta redimensionando.
export type CardShapeType = "retangulo" | "elipse" | "triangulo";

export const CARD_SHAPE_TYPES: { value: CardShapeType; label: string }[] = [
  { value: "retangulo", label: "Retângulo" },
  { value: "elipse", label: "Elipse" },
  { value: "triangulo", label: "Triângulo" },
];

export type CardShape = {
  id: string;
  type: CardShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number; // 0-1
  // Arredondamento dos cantos (retângulo e triângulo), no espaço de desenho
  // do card; ausente/0 = cantos retos (formas salvas antes disto). Ver
  // formaArredondada.ts.
  raio?: number;
  // Forma desligada (marcador da lista de Formas): não aparece no editor, na
  // visualização nem no PDF, mas continua salva. Ausente = visível.
  oculto?: boolean;
  // Id do grupo (ver cardElementos.ts).
  grupo?: string;
};

// Só as formas ligadas (sem `oculto`) — o que o editor desenha, a visualização
// mostra e o PDF imprime.
export function formasVisiveis(shapes: CardShape[]): CardShape[] {
  return shapes.filter((s) => !s.oculto);
}

export function defaultCardShape(type: CardShapeType, id: string): CardShape {
  return { id, type, x: 20, y: 20, w: 80, h: 80, color: "#4fc3f7", opacity: 0.5 };
}

// Contorno desenhado ao redor de cada card na grade do catálogo
// montado (spec não previa isso — pedido do usuário depois de ver o
// preview: o contorno cinza fino que já existia sempre fixo virou
// configurável). `ativa: true` como padrão reproduz exatamente a
// aparência antiga (contorno cinza claro, 1px, sempre ligado) — sem
// isso, todo card-molde salvo antes dessa mudança perderia o contorno
// ao carregar.
export type CardBorda = {
  ativa: boolean;
  cor: string;
  opacidade: number; // 0-1
  espessura: number; // px, no mesmo espaço de desenho do card (encolhe junto com o cardScale do reflow)
  // Aparência do CARD inteiro, guardada junto do contorno (mesma coluna
  // borda_json — evita migração de banco): fundo de cor e cantos
  // arredondados (o fundo e o contorno seguem o arredondamento). Ausente =
  // sem fundo / cantos retos.
  fundo?: CardFundo;
  raio?: number;
};

export function defaultCardBorda(): CardBorda {
  return { ativa: true, cor: "#e2e8f0", opacidade: 1, espessura: 1 };
}
