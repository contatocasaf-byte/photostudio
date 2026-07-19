// Monta o payload de exportação de PDF (Fase 5, Parte 10) a partir do
// resultado JÁ CALCULADO de reflowCatalog() — espelha, campo a campo,
// a ordem e a lógica de desenho de catalogos/[id]/preview/PreviewPageCanvas.tsx
// (fundo -> campos de cabeçalho/rodapé -> bordas de card -> formas de
// card -> campos de card), só que emitindo uma lista plana em vez de
// nós Konva. Geometria/decisões de merge (cards encostados, versão de
// molde por item) ficam 100% aqui — o backend Python só resolve o que
// exige medição de pixel/fonte (encaixe de foto, quebra de texto).
import type { TextAlign } from "@/lib/canvasText";
import { CARD_FIELD_DEFS, type CardImageElementConfig, type CardShapeType, type CardTextElementConfig } from "./cardConfig";
import { PAGE_FIELD_DEFS, substitutePlaceholders, type PageImageElementConfig, type PageTextElementConfig } from "./pageConfig";
import { resolveCardFieldDisplayText, type PreviewPage } from "./reflow";

export type PdfImageSpec = {
  kind: "image";
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fit: "contain" | "stretch";
};

export type PdfTextSpec = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  maxW: number;
  fontSizeMax: number;
  minSize: number;
  color: string;
  align: TextAlign;
  fontWeight: "bold" | "normal";
  maxLines: number;
  lineSpacing: number;
};

export type PdfFieldSpec = PdfImageSpec | PdfTextSpec;

export type PdfShapeSpec = {
  shapeType: CardShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
};

export type PdfBorderSpec = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  opacity: number;
  width: number;
};

export type PdfPageSpec = {
  background: PdfImageSpec | null;
  pageFields: PdfFieldSpec[];
  cardBorders: PdfBorderSpec[];
  cardShapes: PdfShapeSpec[];
  cardFields: PdfFieldSpec[];
};

export type PdfExportPayload = {
  paginaLargura: number;
  paginaAltura: number;
  pages: PdfPageSpec[];
};

// Toda foto de produto distinta usada no catálogo (por URL da rota-
// proxy da galeria) — usado pra decidir o que precisa ser copiado pro
// R2 antes de chamar o endpoint de geração (Python não acessa o Drive).
export function collectDistinctFotoUrls(pages: PreviewPage[]): string[] {
  const urls = new Set<string>();
  for (const page of pages) {
    for (const card of page.cards) {
      if (card.product.fotoUrl) urls.add(card.product.fotoUrl);
    }
  }
  return [...urls];
}

function buildBackground(page: PreviewPage, paginaLargura: number, paginaAltura: number): PdfImageSpec | null {
  const key = page.pageTemplate?.fundoKey;
  if (!key) return null;
  return { kind: "image", key, x: 0, y: 0, w: paginaLargura, h: paginaAltura, fit: "stretch" };
}

function buildPageFields(page: PreviewPage, numeroPagina: number): PdfFieldSpec[] {
  if (!page.pageTemplate) return [];
  const template = page.pageTemplate;
  const placeholderValues: Record<string, string> = {
    secao_titulo: page.sectionTitulo ?? "",
    pagina: String(numeroPagina),
  };

  const ops: PdfFieldSpec[] = [];
  for (const def of PAGE_FIELD_DEFS) {
    if (!template.elementosHabilitados.includes(def.key)) continue;
    const cfg = template.layout[def.key];
    if (!cfg) continue;

    if (def.type === "image") {
      const imgCfg = cfg as PageImageElementConfig;
      if (!imgCfg.key) continue;
      ops.push({ kind: "image", key: imgCfg.key, x: imgCfg.x, y: imgCfg.y, w: imgCfg.w, h: imgCfg.h, fit: "contain" });
    } else {
      const textCfg = cfg as PageTextElementConfig;
      const text = substitutePlaceholders(textCfg.text ?? "", placeholderValues);
      ops.push({
        kind: "text",
        text,
        x: textCfg.x,
        y: textCfg.y,
        maxW: textCfg.maxW,
        fontSizeMax: textCfg.fontSize,
        minSize: 8,
        color: textCfg.color,
        align: textCfg.align,
        fontWeight: textCfg.fontWeight,
        maxLines: textCfg.maxLines,
        lineSpacing: 1.15,
      });
    }
  }

  // Ilustrações (Fase 5, Parte 13) — lista sem limite, fora do
  // PAGE_FIELD_DEFS enumerado acima; mesma regra de "sem arquivo,
  // omite" já usada pros campos fixos de imagem.
  for (const ill of template.illustracoes) {
    if (!ill.key) continue;
    ops.push({ kind: "image", key: ill.key, x: ill.x, y: ill.y, w: ill.w, h: ill.h, fit: "contain" });
  }

  return ops;
}

function buildCardBorders(page: PreviewPage): PdfBorderSpec[] {
  const cardTemplateAtual = page.cardTemplate;
  if (!cardTemplateAtual) return [];
  const margens = page.pageTemplate?.margens ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const touching = Math.abs(cardTemplateAtual.gutterX - cardTemplateAtual.largura) < 0.5;

  const borders: PdfBorderSpec[] = [];
  for (const card of page.cards) {
    const borda = card.cardTemplate.borda;
    if (!borda.ativa) continue;

    const x0 = margens.left + card.x;
    const y0 = margens.top + card.y;
    const x1 = x0 + card.width;
    const y1 = y0 + card.height;

    const drawLeft = !touching || card.isFirstCol;
    const drawRight = !touching || card.isLastCol;
    const width = borda.espessura * page.cardScale;

    const segments: [number, number, number, number][] = [
      [x0, y0, x1, y0],
      [x0, y1, x1, y1],
    ];
    if (drawLeft) segments.push([x0, y0, x0, y1]);
    if (drawRight) segments.push([x1, y0, x1, y1]);

    for (const [sx1, sy1, sx2, sy2] of segments) {
      borders.push({ x1: sx1, y1: sy1, x2: sx2, y2: sy2, color: borda.cor, opacity: borda.opacidade, width });
    }
  }
  return borders;
}

// Sangria de 1px pro caminho de forma DESENHADA INDIVIDUALMENTE (linha
// mista/não fundida) — cheap insurance contra costura visível entre
// vetores adjacentes em alguns leitores de PDF (mesmo raciocínio já
// usado em PreviewCardShape, só que aqui em espaço de página cru, sem
// o fator de escala de tela que o Konva tinha). A faixa fundida
// (retângulo único cobrindo a linha inteira) não precisa disso — já é
// um preenchimento contínuo, sem costura pra cobrir.
const SHAPE_BLEED = 1;

function buildCardShapes(page: PreviewPage): PdfShapeSpec[] {
  const cardTemplateAtual = page.cardTemplate;
  if (!cardTemplateAtual || page.cards.length === 0) return [];
  const margens = page.pageTemplate?.margens ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const cardScale = page.cardScale;
  const touchingX = Math.abs(cardTemplateAtual.gutterX - cardTemplateAtual.largura) < 0.5;

  const linhas = new Map<number, PreviewPage["cards"]>();
  for (const card of page.cards) {
    const grupo = linhas.get(card.y) ?? [];
    grupo.push(card);
    linhas.set(card.y, grupo);
  }

  const shapes: PdfShapeSpec[] = [];

  function pushIndividual(card: PreviewPage["cards"][number], shape: (typeof card.cardTemplate.shapes)[number]) {
    const originX = margens.left + card.x;
    const originY = margens.top + card.y;
    shapes.push({
      shapeType: shape.type,
      x: originX + shape.x * cardScale - SHAPE_BLEED / 2,
      y: originY + shape.y * cardScale - SHAPE_BLEED / 2,
      w: shape.w * cardScale + SHAPE_BLEED,
      h: shape.h * cardScale + SHAPE_BLEED,
      color: shape.color,
      opacity: shape.opacity,
    });
  }

  for (const [y, linha] of linhas) {
    const uniforme = linha.every((c) => c.cardTemplate === linha[0].cardTemplate);
    if (!uniforme) {
      for (const card of linha) {
        for (const shape of card.cardTemplate.shapes) pushIndividual(card, shape);
      }
      continue;
    }

    const template = linha[0].cardTemplate;
    for (const shape of template.shapes) {
      const encostaNaBorda = shape.type === "retangulo" && shape.x + shape.w >= cardTemplateAtual.gutterX - 0.5;
      if (touchingX && encostaNaBorda && linha.length > 1) {
        const primeiro = linha[0];
        const ultimo = linha[linha.length - 1];
        const x0 = margens.left + primeiro.x + shape.x * cardScale;
        const x1 = margens.left + ultimo.x + shape.x * cardScale + shape.w * cardScale;
        const yTop = margens.top + y + shape.y * cardScale;
        shapes.push({
          shapeType: "retangulo",
          x: x0,
          y: yTop,
          w: x1 - x0,
          h: shape.h * cardScale,
          color: shape.color,
          opacity: shape.opacity,
        });
      } else {
        for (const card of linha) pushIndividual(card, shape);
      }
    }
  }

  return shapes;
}

function buildCardFields(page: PreviewPage, fotoKeyByUrl: Map<string, string>): PdfFieldSpec[] {
  if (!page.cardTemplate) return [];
  const margens = page.pageTemplate?.margens ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const cardScale = page.cardScale;

  const ops: PdfFieldSpec[] = [];
  for (const card of page.cards) {
    const cardTemplate = card.cardTemplate;
    const originX = margens.left + card.x;
    const originY = margens.top + card.y;

    for (const def of CARD_FIELD_DEFS) {
      if (!cardTemplate.camposHabilitados.includes(def.key)) continue;
      const cfg = cardTemplate.layout[def.key];
      if (!cfg) continue;

      if (def.type === "image") {
        const imgCfg = cfg as CardImageElementConfig;
        const fotoUrl = card.product.fotoUrl;
        const key = fotoUrl ? fotoKeyByUrl.get(fotoUrl) : undefined;
        // Sem foto correspondente (ou ainda não copiada pro R2): omite
        // o campo inteiro no PDF final — o retângulo tracejado do
        // editor/preview é affordance de "ainda editando", não faz
        // sentido num documento final.
        if (!key) continue;
        ops.push({
          kind: "image",
          key,
          x: originX + imgCfg.x * cardScale,
          y: originY + imgCfg.y * cardScale,
          w: imgCfg.w * cardScale,
          h: imgCfg.h * cardScale,
          fit: "contain",
        });
      } else {
        const textCfg = cfg as CardTextElementConfig;
        const text = resolveCardFieldDisplayText(def.key, textCfg, card.product);
        if (!text) continue;
        ops.push({
          kind: "text",
          text,
          x: originX + textCfg.x * cardScale,
          y: originY + textCfg.y * cardScale,
          maxW: textCfg.maxW * cardScale,
          fontSizeMax: textCfg.fontSize * cardScale,
          minSize: 8,
          color: textCfg.color,
          align: textCfg.align,
          fontWeight: textCfg.fontWeight,
          maxLines: textCfg.maxLines,
          lineSpacing: 1.15,
        });
      }
    }
  }
  return ops;
}

function buildPageSpec(
  page: PreviewPage,
  paginaLargura: number,
  paginaAltura: number,
  numeroPagina: number,
  fotoKeyByUrl: Map<string, string>
): PdfPageSpec {
  return {
    background: buildBackground(page, paginaLargura, paginaAltura),
    pageFields: buildPageFields(page, numeroPagina),
    cardBorders: buildCardBorders(page),
    cardShapes: buildCardShapes(page),
    cardFields: buildCardFields(page, fotoKeyByUrl),
  };
}

// `fotoKeyByUrl` mapeia fotoUrl (rota-proxy da galeria) -> chave R2 já
// copiada lá (ver catalogos/pdf/exportPdf.ts) — produtos cuja foto
// ainda não foi copiada (ou sem foto nenhuma) simplesmente não
// desenham o campo de foto no PDF.
export function buildPdfExportPayload(
  pages: PreviewPage[],
  paginaLargura: number,
  paginaAltura: number,
  fotoKeyByUrl: Map<string, string>
): PdfExportPayload {
  return {
    paginaLargura,
    paginaAltura,
    pages: pages.map((page, i) => buildPageSpec(page, paginaLargura, paginaAltura, i + 1, fotoKeyByUrl)),
  };
}
