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
import {
  fontPairsFromCardLayout,
  substitutePlaceholders,
  type CardBorda,
  type CardFieldKey,
  type CardLayout,
  type CardShape,
  type CardTextElementConfig,
} from "./cardConfig";
import { fontPairsFromPageLayout, type PageFieldKey, type PageLayout, type PageTipo, type Margens } from "./pageConfig";
import type { ProductRow } from "../produtos/actions";

export type CardTemplateInput = {
  layout: CardLayout;
  largura: number;
  alturaMinima: number;
  alturaCresceCom: CardFieldKey | null;
  gutterX: number;
  gutterY: number;
  camposHabilitados: CardFieldKey[];
  shapes: CardShape[];
  borda: CardBorda;
};

export type SectionReflowInput = {
  id: string;
  titulo: string;
  colunas: number;
  // Versão MAIS RECENTE do card-molde da seção — usada só pra
  // estrutura da grade (largura/gutterX/gutterY, spec 3.4: "a largura
  // de coluna nunca é versionada"). O conteúdo visual de cada card
  // (layout/altura/campos/formas/contorno) é resolvido por item via
  // `templateVersions` + `items[].cardTemplateVersao` (spec 3.5).
  cardTemplate: CardTemplateInput | null;
  // Todas as versões de card-molde já salvas pra essa seção — permite
  // um produto posicionado antes de uma edição "aplicar só aos novos"
  // continuar desenhando com o molde antigo.
  templateVersions: { versao: number; template: CardTemplateInput }[];
  items: { product: ProductRow; cardTemplateVersao: number }[]; // já ordenados (ver Parte 5)
};

export type PageTemplateInput = {
  layout: PageLayout;
  elementosHabilitados: PageFieldKey[];
  margens: Margens;
  fundoUrl: string | null;
  // Chave crua do R2 (não a URL pública) — exportação de PDF (Fase 5
  // Parte 10) precisa disso porque o backend Python só recebe chaves,
  // nunca URLs (evita adicionar um cliente HTTP novo ao Python, que só
  // fala com R2 via boto3).
  fundoKey: string | null;
};

// Página avulsa entre seções (Fase 5, Parte 12) — já com o template
// resolvido (mesmo formato de qualquer outro PageTemplateInput), só
// ancorada por seção em vez de por tipo fixo. `aposSecaoId: null` =
// antes de tudo (logo depois da capa, se houver).
export type PaginaAvulsaInput = {
  id: string;
  titulo: string;
  aposSecaoId: string | null;
  ordem: number;
  template: PageTemplateInput;
};

export type ReflowInput = {
  paginaLargura: number;
  paginaAltura: number;
  pageTemplates: Partial<Record<PageTipo, PageTemplateInput>>;
  sections: SectionReflowInput[];
  paginasAvulsas: PaginaAvulsaInput[];
};

export type PositionedCard = {
  x: number;
  y: number;
  width: number;
  height: number;
  product: ProductRow;
  // Molde resolvido especificamente pra ESTE item (spec 3.5) — pode
  // divergir do `cardTemplate` da PreviewPage (que é sempre a versão
  // mais recente da seção, usada só pra estrutura da grade): um
  // produto posicionado antes de uma edição "aplicar só aos novos"
  // continua desenhando com o molde antigo, mesmo ao lado de produtos
  // mais novos na mesma linha da grade.
  cardTemplate: CardTemplateInput;
  // Posição na LINHA (não na grade inteira) — usado só pra decidir onde
  // desenhar o contorno do card quando os cards estão encostados (ver
  // PreviewPageCanvas.tsx): sem isso, cada card desenharia sua própria
  // lateral esquerda/direita e sobraria uma linha bem no meio de uma
  // faixa de cor pensada pra ser contínua entre os cards.
  isFirstCol: boolean;
  isLastCol: boolean;
};

export type PreviewPage = {
  tipo: PageTipo;
  sectionId: string | null;
  sectionTitulo: string | null;
  pageTemplate: PageTemplateInput | null;
  // Versão MAIS RECENTE do card-molde da seção — só pra estrutura da
  // grade (detecção de "encostado", cálculo de cardScale). O conteúdo
  // visual de cada card usa `card.cardTemplate` (ver PositionedCard).
  cardTemplate: CardTemplateInput | null;
  // Fator (<=1) aplicado a todo valor em pixel relativo ao card (boundary
  // + cada campo/forma dentro dele) quando a grade, no tamanho de
  // desenho do card-molde, não cabe na largura útil da página pro nº de
  // colunas configurado — ver cálculo em reflowSection. 1 = sem ajuste.
  cardScale: number;
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
  const cardTemplateAtual = section.cardTemplate;
  if (!cardTemplateAtual) return [];

  // Resolve o molde de CADA item pela versão gravada nele
  // (`card_template_versao`, spec 3.5) — cai pra versão atual se por
  // algum motivo a versão específica não estiver na lista (defensivo,
  // não deveria acontecer em uso normal).
  const templatesByVersao = new Map(section.templateVersions.map((v) => [v.versao, v.template]));
  function resolveTemplate(versao: number): CardTemplateInput {
    return templatesByVersao.get(versao) ?? cardTemplateAtual!;
  }

  const itens = section.items;
  const paginas: PreviewPage[] = [];
  let indice = 0;
  let primeiraPagina = true;

  while (indice < itens.length) {
    const tipoPagina: PageTipo = primeiraPagina ? "abertura_secao" : "continuacao";
    const pageTemplate = pageTemplates[tipoPagina] ?? null;
    const areaUtilAltura = pageTemplate ? paginaAltura - pageTemplate.margens.top - pageTemplate.margens.bottom : paginaAltura;
    const areaUtilLargura = pageTemplate ? paginaLargura - pageTemplate.margens.left - pageTemplate.margens.right : paginaLargura;

    // Largura/gutter da grade vêm sempre da versão ATUAL (mais
    // recente) da seção, nunca da versão de um item individual — spec
    // 3.4/3.5: a largura de coluna não é versionada, senão a grade
    // desalinharia entre produtos com moldes diferentes na mesma
    // linha. Se estourar a área útil da página (card largo demais pro
    // nº de colunas configurado), a grade inteira encolhe
    // proporcionalmente até caber (cardScale), em vez de vazar.
    const larguraNecessaria = (section.colunas - 1) * cardTemplateAtual.gutterX + cardTemplateAtual.largura;
    const cardScale = larguraNecessaria > areaUtilLargura && larguraNecessaria > 0 ? areaUtilLargura / larguraNecessaria : 1;

    const page: PreviewPage = {
      tipo: tipoPagina,
      sectionId: section.id,
      sectionTitulo: section.titulo,
      pageTemplate,
      cardTemplate: cardTemplateAtual,
      cardScale,
      cards: [],
    };

    let areaRestante = areaUtilAltura;
    let cursorY = 0;
    let progressoNestaPagina = false;

    while (indice < itens.length) {
      const fimLinha = Math.min(indice + section.colunas, itens.length);
      const linha = itens.slice(indice, fimLinha);
      // Altura da linha usa a versão do molde de CADA item, não a
      // versão atual da seção — é isso que permite um produto
      // posicionado antes de uma edição "só novos" continuar com a
      // altura/layout do molde antigo (spec 3.5).
      const alturaLinha = Math.max(...linha.map((it) => calcularAlturaCard(resolveTemplate(it.cardTemplateVersao), it.product)));

      // Só recusa a linha se já colocou pelo menos uma nesta página —
      // garante progresso mesmo se uma linha sozinha já estourar a
      // área útil inteira (evita loop infinito nesse caso extremo).
      if (alturaLinha > areaRestante && progressoNestaPagina) break;

      linha.forEach((it, col) => {
        page.cards.push({
          x: col * cardTemplateAtual.gutterX * cardScale,
          y: cursorY,
          width: cardTemplateAtual.largura * cardScale,
          height: alturaLinha * cardScale,
          product: it.product,
          cardTemplate: resolveTemplate(it.cardTemplateVersao),
          isFirstCol: col === 0,
          isLastCol: col === linha.length - 1,
        });
      });

      cursorY += alturaLinha + cardTemplateAtual.gutterY;
      areaRestante -= alturaLinha + cardTemplateAtual.gutterY;
      indice = fimLinha;
      progressoNestaPagina = true;
    }

    paginas.push(page);
    primeiraPagina = false;
  }

  return paginas;
}

// Seção que não gerou nenhuma página — sem isso, uma seção sem
// card-molde configurado ou sem produtos adicionados simplesmente
// desaparecia do preview sem nenhum aviso (foi assim que o usuário
// notou: "só aparece a capa e a primeira seção", com a segunda seção
// sumindo em silêncio).
export type SkippedSection = { id: string; titulo: string; motivo: "sem_card_molde" | "sem_produtos" };

export type ReflowResult = { pages: PreviewPage[]; skipped: SkippedSection[] };

// Agrupa páginas avulsas por âncora (mesma ordenação já persistida) —
// usado pelo loop principal pra intercalar na sequência certa, sem
// mexer no espaço de `ordem` das seções (ver decisão na Parte 12: essa
// é aggressively renumerada de forma densa a cada reordenação, então
// não dá pra compartilhar o mesmo número com as avulsas).
function groupPaginasAvulsasByAnchor(paginasAvulsas: PaginaAvulsaInput[]): Map<string | null, PaginaAvulsaInput[]> {
  const map = new Map<string | null, PaginaAvulsaInput[]>();
  for (const av of paginasAvulsas) {
    const list = map.get(av.aposSecaoId) ?? [];
    list.push(av);
    map.set(av.aposSecaoId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.ordem - b.ordem);
  return map;
}

function paginaAvulsaToPreviewPage(av: PaginaAvulsaInput): PreviewPage {
  return {
    tipo: "custom",
    sectionId: null,
    sectionTitulo: av.titulo,
    pageTemplate: av.template,
    cardTemplate: null,
    cardScale: 1,
    cards: [],
  };
}

export function reflowCatalog(input: ReflowInput): ReflowResult {
  const pages: PreviewPage[] = [];
  const skipped: SkippedSection[] = [];
  const avulsasByAnchor = groupPaginasAvulsasByAnchor(input.paginasAvulsas);

  if (input.pageTemplates.capa) {
    pages.push({
      tipo: "capa",
      sectionId: null,
      sectionTitulo: null,
      pageTemplate: input.pageTemplates.capa,
      cardTemplate: null,
      cardScale: 1,
      cards: [],
    });
  }

  // Avulsas ancoradas em `null` (antes de tudo) — logo depois da capa,
  // antes da primeira seção.
  for (const av of avulsasByAnchor.get(null) ?? []) pages.push(paginaAvulsaToPreviewPage(av));

  for (const section of input.sections) {
    if (!section.cardTemplate) {
      skipped.push({ id: section.id, titulo: section.titulo, motivo: "sem_card_molde" });
    } else if (section.items.length === 0) {
      skipped.push({ id: section.id, titulo: section.titulo, motivo: "sem_produtos" });
    } else {
      pages.push(...reflowSection(section, input.pageTemplates, input.paginaLargura, input.paginaAltura));
    }
    // Avulsas ancoradas nesta seção aparecem logo depois dela, mesmo
    // se a seção em si foi pulada (a avulsa é conteúdo independente,
    // não depende da seção ter card-molde/produtos configurados).
    for (const av of avulsasByAnchor.get(section.id) ?? []) pages.push(paginaAvulsaToPreviewPage(av));
  }

  return { pages, skipped };
}

// Todo par família/peso realmente usado num catálogo já montado
// (fundo/cabeçalho/rodapé de cada página + campos de cada card, que
// podem variar por versão de molde numa mesma página) — usado pra
// pré-carregar (ensureFontsLoaded) antes de desenhar a tela de
// preview, mesmo mecanismo já usado nos editores de card-molde/página.
export function fontPairsFromPreviewPages(pages: PreviewPage[]): { family: string; weight: number }[] {
  const pairs: { family: string; weight: number }[] = [];
  for (const page of pages) {
    if (page.pageTemplate) pairs.push(...fontPairsFromPageLayout(page.pageTemplate.layout));
    for (const card of page.cards) pairs.push(...fontPairsFromCardLayout(card.cardTemplate.layout));
  }
  return pairs;
}
