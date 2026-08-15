// Modelo do "molde" de página (spec seção 3.1, PageTemplate): moldura
// fixa de cabeçalho (banner de título, ilustração, logo) e rodapé
// (numeração, contato) — campos fixos e enumerados, mesma escolha já
// feita pro card-molde (Parte 2) e pelos mesmos motivos (a própria
// especificação já enumera os elementos esperados, usando até a
// palavra "fixos"). `zone` marca estaticamente se cada campo pertence
// ao cabeçalho ou ao rodapé — usado só na hora de serializar pra
// header_json/footer_json (ver catalogos/paginas/actions.ts); o
// estado do editor em si trabalha com um único CardLayout-like, igual
// ao card-molde.
import type { TextAlign } from "@/lib/canvasText";

// "ilustracao" saiu daqui na Parte 13 — deixou de ser 1 campo fixo e
// virou uma lista sem limite (ver PageIllustration abaixo), mesmo
// padrão já usado pras formas decorativas do card-molde.
export type PageFieldKey = "banner_titulo" | "logo" | "numeracao" | "contato";
export type PageFieldType = "image" | "text";
export type PageZone = "header" | "footer";

export type PageFieldDef = {
  key: PageFieldKey;
  label: string;
  type: PageFieldType;
  zone: PageZone;
  sampleText: string | null;
};

export const PAGE_FIELD_DEFS: PageFieldDef[] = [
  { key: "banner_titulo", label: "Banner de Título", type: "text", zone: "header", sampleText: "Nome da Seção" },
  { key: "logo", label: "Logo", type: "image", zone: "header", sampleText: null },
  { key: "numeracao", label: "Numeração", type: "text", zone: "footer", sampleText: "1" },
  { key: "contato", label: "Contato", type: "text", zone: "footer", sampleText: "(11) 1234-5678 · loja.com.br" },
];

// Placeholders disponíveis pra cada campo de texto — banner_titulo e
// numeração não são texto fixo digitado uma vez (cada seção/página é
// diferente), precisam de substituição na hora de montar o preview/PDF
// de verdade (mesmo mecanismo já usado no Editor de Layout do Gerador
// de Ofertas, `substitutePlaceholders`). {validade} só resolve pra
// algo em Jornal de Ofertas — fica "" (placeholder vira texto vazio)
// num catálogo comum, disponível mesmo assim pra quem quiser usar o
// mesmo modelo de página nos dois tipos.
export const PAGE_PLACEHOLDERS: Partial<Record<PageFieldKey, string[]>> = {
  banner_titulo: ["{secao_titulo}", "{validade}"],
  numeracao: ["{pagina}"],
  contato: ["{validade}"],
};

// Substitui {placeholder} pelo valor correspondente — placeholder sem
// valor conhecido fica como está (não quebra o texto). Cópia
// intencionalmente independente da de ofertas/core/layoutConfig.ts —
// mesma lógica de 1 linha, sem motivo real pra acoplar os dois módulos
// por isso.
export function substitutePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

// Campos de imagem sobem arquivo de verdade pro R2 (prefixo
// catalogos/assets/) — são assets de marca fixos, preparados de
// antemão, o mesmo em toda página daquele tipo. Diferente do campo
// "foto" do card-molde, que é só um placeholder (depende de um
// produto que ainda não existe).
export type PageImageElementConfig = { x: number; y: number; w: number; h: number; key: string | null; url: string | null };

// Ilustração de página (Fase 5, Parte 13) — lista sem limite (não um
// campo fixo do PAGE_FIELD_DEFS), mesmo padrão de CardShape no
// card-molde: cada uma tem `id` próprio, mesma forma de posição/
// tamanho/arquivo de PageImageElementConfig (sempre com encaixe
// "contain fit" sem cortar o conteúdo, como o antigo campo único já
// fazia).
export type PageIllustration = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  key: string | null;
  url: string | null;
};

export function defaultPageIllustration(id: string): PageIllustration {
  return { id, x: 40, y: 40, w: 220, h: 160, key: null, url: null };
}

// Formas decorativas na página (Fase 5, Parte 16) — mesmo padrão de
// CardShape no card-molde (cardConfig.ts): lista livre, sem vínculo com
// nenhum campo fixo. Tipo independente em vez de importado de
// cardConfig — mesma decisão já tomada pra PageIllustration/
// PageImageElementConfig (módulos de página e card ficam sem
// dependência cruzada, mesmo com forma estruturalmente idêntica).
export type PageShapeType = "retangulo" | "elipse" | "triangulo";

export const PAGE_SHAPE_TYPES: { value: PageShapeType; label: string }[] = [
  { value: "retangulo", label: "Retângulo" },
  { value: "elipse", label: "Elipse" },
  { value: "triangulo", label: "Triângulo" },
];

export type PageShape = {
  id: string;
  type: PageShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number; // 0-1
};

export function defaultPageShape(type: PageShapeType, id: string): PageShape {
  return { id, type, x: 40, y: 40, w: 120, h: 120, color: "#4fc3f7", opacity: 0.5 };
}

// Biblioteca de fontes (Fase 5, Parte 11) — mesma de src/lib/fonts/,
// compartilhada com o Gerador de Ofertas e com o card-molde
// (cardConfig.ts). "Arial" continua o padrão — modelo de página salvo
// antes desta parte não tem `fontFamily` gravado, então todo ponto de
// leitura usa `cfg.fontFamily ?? DEFAULT_FONT_FAMILY`, nunca o campo
// direto.
export const DEFAULT_FONT_FAMILY = "Arial";

export type PageTextElementConfig = {
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
};
export type PageElementConfig = Partial<PageImageElementConfig & PageTextElementConfig>;
export type PageLayout = Record<PageFieldKey, PageElementConfig>;

// Todo par família/peso realmente usado pelos campos de TEXTO de um
// modelo de página — usado pra pré-carregar (ensureFontsLoaded, ver
// src/lib/fonts/fontLoader.ts) antes de desenhar, mesmo mecanismo já
// usado no Editor de Layout do Gerador de Ofertas e no card-molde.
export function fontPairsFromPageLayout(layout: PageLayout): { family: string; weight: number }[] {
  return PAGE_FIELD_DEFS.filter((d) => d.type === "text").map((d) => {
    const cfg = layout[d.key] as Partial<PageTextElementConfig> | undefined;
    return {
      family: cfg?.fontFamily ?? DEFAULT_FONT_FAMILY,
      weight: cfg?.fontWeight === "bold" ? 700 : 400,
    };
  });
}

// "custom" (Fase 5, Parte 12) — página avulsa entre seções, design
// one-off só dela, não um dos slots fixos. Fora de PAGE_TIPOS de
// propósito: não é uma tela fixa em /catalogos/[id]/paginas, tem sua
// própria UI de criação/edição (ver paginas-avulsas/).
//
// "abertura_secao" também saiu de PAGE_TIPOS na Parte 15, e
// "continuacao" pelo mesmo motivo depois — deixaram de ser 1 slot fixo
// por catálogo (upsert por (catalog_id, tipo)) e viraram listas de
// variantes nomeadas, cada seção escolhendo qual usar (ou herdando o
// padrão do catálogo). Continuam valores válidos de PageTipo (linhas
// no banco continuam tipo='abertura_secao'/'continuacao', só que podem
// ser várias por catálogo agora) — só não são mais slots únicos ao
// lado de capa. UI própria em /catalogos/[id]/paginas/abertura/ e
// /catalogos/[id]/paginas/continuacao/.
export type PageTipo = "capa" | "abertura_secao" | "continuacao" | "custom";

export const PAGE_TIPOS: { value: Exclude<PageTipo, "custom" | "abertura_secao" | "continuacao">; label: string }[] = [
  { value: "capa", label: "Capa" },
];

export const DEFAULT_PAGE_WIDTH = 1240;
export const DEFAULT_PAGE_HEIGHT = 1754;

// Conversão mm↔px fixa em 150dpi — mesma proporção já usada pro
// default A4 acima (210mm/297mm × 150/25.4 ≈ 1240×1754px). Não é uma
// escolha nova: só torna explícita a conversão que já estava embutida
// nos números default, pra poder oferecer "mm" como unidade
// alternativa no editor sem inventar outra proporção.
export const PX_PER_MM = 150 / 25.4;

export function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM);
}

export function pxToMm(px: number): number {
  return Math.round(px / PX_PER_MM);
}

// Tamanhos pré-definidos populares: papel (definido em mm, convertido
// via PX_PER_MM) e redes sociais (já nativamente em px — essas
// plataformas definem o tamanho exato do arquivo, não um tamanho
// físico de impressão).
export type PageSizePreset = {
  key: string;
  label: string;
  group: "Papel" | "Redes sociais";
  larguraMm?: number;
  alturaMm?: number;
  larguraPx?: number;
  alturaPx?: number;
};

export const PAGE_SIZE_PRESETS: PageSizePreset[] = [
  { key: "a4", label: "A4 (210 × 297 mm)", group: "Papel", larguraMm: 210, alturaMm: 297 },
  { key: "a5", label: "A5 (148 × 210 mm)", group: "Papel", larguraMm: 148, alturaMm: 210 },
  { key: "carta", label: "Carta (216 × 279 mm)", group: "Papel", larguraMm: 216, alturaMm: 279 },
  { key: "ig-feed", label: "Instagram Feed (1080 × 1080 px)", group: "Redes sociais", larguraPx: 1080, alturaPx: 1080 },
  { key: "ig-story", label: "Instagram Stories (1080 × 1920 px)", group: "Redes sociais", larguraPx: 1080, alturaPx: 1920 },
  { key: "fb-post", label: "Facebook Post (1200 × 630 px)", group: "Redes sociais", larguraPx: 1200, alturaPx: 630 },
  { key: "pinterest", label: "Pinterest Pin (1000 × 1500 px)", group: "Redes sociais", larguraPx: 1000, alturaPx: 1500 },
];

export function presetToPx(preset: PageSizePreset): { largura: number; altura: number } {
  if (preset.larguraPx !== undefined && preset.alturaPx !== undefined) {
    return { largura: preset.larguraPx, altura: preset.alturaPx };
  }
  return { largura: mmToPx(preset.larguraMm ?? 0), altura: mmToPx(preset.alturaMm ?? 0) };
}

export const DEFAULT_ELEMENTOS_HABILITADOS: PageFieldKey[] = ["banner_titulo", "logo", "numeracao", "contato"];

export type Margens = { top: number; right: number; bottom: number; left: number };

// "Área útil" que o motor de reflow (fase futura) vai usar pra saber
// onde o conteúdo pode entrar — aqui é só visual/persistência, sem
// consumidor ainda.
export function defaultMargens(largura: number, altura: number): Margens {
  return {
    top: Math.round(altura * 0.1),
    bottom: Math.round(altura * 0.08),
    left: Math.round(largura * 0.06),
    right: Math.round(largura * 0.06),
  };
}

export function defaultPageLayout(largura: number = DEFAULT_PAGE_WIDTH, altura: number = DEFAULT_PAGE_HEIGHT): PageLayout {
  const margin = Math.round(largura * 0.06);
  const contentW = largura - margin * 2;

  return {
    logo: { x: margin, y: margin, w: 130, h: 60 },
    banner_titulo: {
      x: margin,
      y: margin + 90,
      text: "{secao_titulo}",
      fontSize: 44,
      maxW: contentW,
      color: "#1a1a1a",
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: "bold",
      align: "center",
      maxLines: 1,
    },
    numeracao: {
      x: largura - margin - 120,
      y: altura - 60,
      text: "{pagina}",
      fontSize: 16,
      maxW: 120,
      color: "#666666",
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: "normal",
      align: "right",
      maxLines: 1,
    },
    contato: {
      x: margin,
      y: altura - 60,
      text: "(11) 1234-5678 · loja.com.br",
      fontSize: 14,
      maxW: contentW,
      color: "#666666",
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: "normal",
      align: "center",
      maxLines: 1,
    },
  };
}
