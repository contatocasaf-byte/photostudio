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

export type PageFieldKey = "banner_titulo" | "ilustracao" | "logo" | "numeracao" | "contato";
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
  { key: "ilustracao", label: "Ilustração", type: "image", zone: "header", sampleText: null },
  { key: "logo", label: "Logo", type: "image", zone: "header", sampleText: null },
  { key: "numeracao", label: "Numeração", type: "text", zone: "footer", sampleText: "1" },
  { key: "contato", label: "Contato", type: "text", zone: "footer", sampleText: "(11) 1234-5678 · loja.com.br" },
];

// Campos de imagem sobem arquivo de verdade pro R2 (prefixo
// catalogos/assets/) — são assets de marca fixos, preparados de
// antemão, o mesmo em toda página daquele tipo. Diferente do campo
// "foto" do card-molde, que é só um placeholder (depende de um
// produto que ainda não existe).
export type PageImageElementConfig = { x: number; y: number; w: number; h: number; key: string | null; url: string | null };
export type PageTextElementConfig = {
  x: number;
  y: number;
  fontSize: number;
  maxW: number;
  color: string;
  fontWeight: "bold" | "normal";
  align: TextAlign;
  maxLines: number;
};
export type PageElementConfig = Partial<PageImageElementConfig & PageTextElementConfig>;
export type PageLayout = Record<PageFieldKey, PageElementConfig>;

export type PageTipo = "capa" | "abertura_secao" | "continuacao";

export const PAGE_TIPOS: { value: PageTipo; label: string }[] = [
  { value: "capa", label: "Capa" },
  { value: "abertura_secao", label: "Abertura de Seção" },
  { value: "continuacao", label: "Continuação" },
];

export const DEFAULT_PAGE_WIDTH = 1240;
export const DEFAULT_PAGE_HEIGHT = 1754;

export const DEFAULT_ELEMENTOS_HABILITADOS: PageFieldKey[] = ["banner_titulo", "ilustracao", "logo", "numeracao", "contato"];

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
    ilustracao: { x: largura - margin - 220, y: margin, w: 220, h: 160 },
    banner_titulo: {
      x: margin,
      y: margin + 90,
      fontSize: 44,
      maxW: contentW,
      color: "#1a1a1a",
      fontWeight: "bold",
      align: "center",
      maxLines: 1,
    },
    numeracao: {
      x: largura - margin - 120,
      y: altura - 60,
      fontSize: 16,
      maxW: 120,
      color: "#666666",
      fontWeight: "normal",
      align: "right",
      maxLines: 1,
    },
    contato: {
      x: margin,
      y: altura - 60,
      fontSize: 14,
      maxW: contentW,
      color: "#666666",
      fontWeight: "normal",
      align: "center",
      maxLines: 1,
    },
  };
}
