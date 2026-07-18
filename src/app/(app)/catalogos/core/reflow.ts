// Motor de reflow (spec seção 3.4): distribui os produtos de cada
// seção em linhas/páginas automaticamente, com altura de linha
// dinâmica — a linha "respira" pro card mais alto entre os produtos
// daquela linha específica. Função PURA (sem persistir catalog_pages,
// ver decisão na Parte 6b do plano) — roda sob demanda na tela de
// preview.
//
// Implementação em lote-e-checa (agrupa a linha inteira, decide se
// cabe, só então consome os índices) em vez de porta literal do
// pseudocódigo da spec, que incrementa o índice a cada item mesmo
// antes de decidir se a linha cabe — isso perderia produtos da linha
// que "sobrou" pra próxima página. Resultado final é o mesmo descrito
// na spec, só a forma de calcular é mais robusta.
import { wrapTextToLines } from "@/lib/canvasText";
import { substitutePlaceholders, type CardFieldKey, type CardLayout, type CardTextElementConfig } from "./cardConfig";
import type { PageFieldKey, PageLayout, PageTipo, Margens } from "./pageConfig";
import type { ProductRow } from "../produtos/actions";

export type CardTemplateInput = {
  layout: CardLayout;
  largura: number;
  alturaMinima: number;
  alturaCresceCom: CardFieldKey | null;
  gutterX: number;
  gutterY: number;
  camposHabilitados: CardFieldKey[];
};

export type SectionReflowInput = {
  id: string;
  titulo: string;
  colunas: number;
  cardTemplate: CardTemplateInput | null;
  items: { product: ProductRow }[]; // já ordenados (ver Parte 5)
};

export type PageTemplateInput = {
  layout: PageLayout;
  elementosHabilitados: PageFieldKey[];
  margens: Margens;
  fundoUrl: string | null;
};

export type ReflowInput = {
  paginaLargura: number;
  paginaAltura: number;
  pageTemplates: Partial<Record<PageTipo, PageTemplateInput>>;
  sections: SectionReflowInput[];
};

export type PositionedCard = { x: number; y: number; width: number; height: number; product: ProductRow };

export type PreviewPage = {
  tipo: PageTipo;
  sectionId: string | null;
  sectionTitulo: string | null;
  pageTemplate: PageTemplateInput | null;
  cardTemplate: CardTemplateInput | null;
  cards: PositionedCard[];
};

function formatPreco(v: number | null): string {
  if (v === null) return "";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Mapeia campo do card-molde -> valor real do produto (sem o rótulo do
// template ainda). Reaproveitado também pela tela de preview
// (renderização), não só pelo cálculo de altura.
export function resolveProductFieldText(key: CardFieldKey, product: ProductRow): string {
  switch (key) {
    case "codigo":
      return product.codigo;
    case "ref":
      return product.ref ?? "";
    case "descricao":
      return product.descricao ?? "";
    case "preco_1":
      return formatPreco(product.preco1);
    case "preco_2":
      return formatPreco(product.preco2);
    case "foto":
      return "";
  }
}

// Texto FINAL a desenhar: valor real do produto já dentro do template
// `text` do campo (ex.: "{valor}" -> "R$ 99,90", "Preço 1: {valor}" ->
// "Preço 1: R$ 99,90") — vazio se o produto não tiver valor pra esse
// campo (evita desenhar só o rótulo sem nada depois).
export function resolveCardFieldDisplayText(key: CardFieldKey, cfg: CardTextElementConfig, product: ProductRow): string {
  const valor = resolveProductFieldText(key, product);
  if (!valor) return "";
  return substitutePlaceholders(cfg.text ?? "{valor}", valor);
}

function computeLineHeight(ctx: CanvasRenderingContext2D, fontSize: number, fontWeight: "bold" | "normal"): number {
  ctx.font = `${fontWeight === "bold" ? "bold " : ""}${fontSize}px Arial`;
  const metrics = ctx.measureText("Ag");
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  return (ascent + descent) * 1.15;
}

// Altura real do card pra ESSE produto específico: altura_minima,
// exceto se o campo "altura_cresce_com" precisar de mais linhas do que
// o `maxLines` desenhado no card-molde (a "reserva" de espaço pro
// tamanho mínimo) — nesse caso cresce pela diferença. Nunca encolhe
// abaixo de altura_minima.
export function calcularAlturaCard(cardTemplate: CardTemplateInput, product: ProductRow): number {
  const { alturaCresceCom, alturaMinima, layout } = cardTemplate;
  if (!alturaCresceCom) return alturaMinima;

  const cfg = layout[alturaCresceCom] as Partial<CardTextElementConfig> | undefined;
  if (!cfg || cfg.maxW === undefined || cfg.fontSize === undefined || cfg.maxLines === undefined) return alturaMinima;

  const texto = resolveCardFieldDisplayText(alturaCresceCom, cfg as CardTextElementConfig, product);
  if (!texto) return alturaMinima;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${cfg.fontWeight === "bold" ? "bold " : ""}${cfg.fontSize}px Arial`;

  // maxLines bem alto (999) pra MEDIR quantas linhas o texto real
  // precisa de verdade, sem truncar como o drawTextFit faz na hora de
  // desenhar — aqui é só medição.
  const { lines } = wrapTextToLines(ctx, texto, cfg.maxW, 999, false);
  const linhasReais = lines.length;
  const reservado = cfg.maxLines;
  if (linhasReais <= reservado) return alturaMinima;

  const lineHeight = computeLineHeight(ctx, cfg.fontSize, cfg.fontWeight ?? "normal");
  return alturaMinima + (linhasReais - reservado) * lineHeight;
}

function reflowSection(
  section: SectionReflowInput,
  pageTemplates: ReflowInput["pageTemplates"],
  paginaLargura: number,
  paginaAltura: number
): PreviewPage[] {
  const cardTemplate = section.cardTemplate;
  if (!cardTemplate) return [];

  const produtos = section.items.map((i) => i.product);
  const paginas: PreviewPage[] = [];
  let indice = 0;
  let primeiraPagina = true;

  while (indice < produtos.length) {
    const tipoPagina: PageTipo = primeiraPagina ? "abertura_secao" : "continuacao";
    const pageTemplate = pageTemplates[tipoPagina] ?? null;
    const areaUtilAltura = pageTemplate ? paginaAltura - pageTemplate.margens.top - pageTemplate.margens.bottom : paginaAltura;

    const page: PreviewPage = {
      tipo: tipoPagina,
      sectionId: section.id,
      sectionTitulo: section.titulo,
      pageTemplate,
      cardTemplate,
      cards: [],
    };

    let areaRestante = areaUtilAltura;
    let cursorY = 0;
    let progressoNestaPagina = false;

    while (indice < produtos.length) {
      const fimLinha = Math.min(indice + section.colunas, produtos.length);
      const linha = produtos.slice(indice, fimLinha);
      const alturaLinha = Math.max(...linha.map((p) => calcularAlturaCard(cardTemplate, p)));

      // Só recusa a linha se já colocou pelo menos uma nesta página —
      // garante progresso mesmo se uma linha sozinha já estourar a
      // área útil inteira (evita loop infinito nesse caso extremo).
      if (alturaLinha > areaRestante && progressoNestaPagina) break;

      linha.forEach((produto, col) => {
        page.cards.push({
          x: col * cardTemplate.gutterX,
          y: cursorY,
          width: cardTemplate.largura,
          height: alturaLinha,
          product: produto,
        });
      });

      cursorY += alturaLinha + cardTemplate.gutterY;
      areaRestante -= alturaLinha + cardTemplate.gutterY;
      indice = fimLinha;
      progressoNestaPagina = true;
    }

    paginas.push(page);
    primeiraPagina = false;
  }

  return paginas;
}

export function reflowCatalog(input: ReflowInput): PreviewPage[] {
  const pages: PreviewPage[] = [];

  if (input.pageTemplates.capa) {
    pages.push({
      tipo: "capa",
      sectionId: null,
      sectionTitulo: null,
      pageTemplate: input.pageTemplates.capa,
      cardTemplate: null,
      cards: [],
    });
  }

  for (const section of input.sections) {
    if (!section.cardTemplate || section.items.length === 0) continue;
    pages.push(...reflowSection(section, input.pageTemplates, input.paginaLargura, input.paginaAltura));
  }

  return pages;
}
