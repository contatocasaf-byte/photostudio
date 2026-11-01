// Fundo e contorno ARREDONDADO dos cards, em coordenadas de página (px, já
// com o cardScale aplicado) — a mesma lista alimenta a visualização
// (PreviewPageCanvas) e o payload do PDF (pdfExport), pra os dois desenharem
// exatamente igual.
import type { PreviewPage } from "./reflow";

export type FundoDoCard = { x: number; y: number; w: number; h: number; cor: string; opacidade: number; raio: number };
export type ContornoDoCard = { x: number; y: number; w: number; h: number; raio: number; cor: string; opacidade: number; espessura: number };

function margensDa(page: PreviewPage) {
  return page.pageTemplate?.margens ?? { top: 0, right: 0, bottom: 0, left: 0 };
}

// Um retângulo por card com fundo ligado — exceto quando os cards estão
// ENCOSTADOS (espaçamento = largura) e sem cantos arredondados: aí a linha
// inteira vira UM retângulo só, pelo mesmo motivo das formas (dois
// preenchimentos antialiasados lado a lado deixam uma costura na emenda,
// mais escura se forem translúcidos).
export function fundosDosCards(page: PreviewPage): FundoDoCard[] {
  const atual = page.cardTemplate;
  if (!atual || page.cards.length === 0) return [];
  const margens = margensDa(page);
  const touching = Math.abs(atual.gutterX - atual.largura) < 0.5;

  const linhas = new Map<number, PreviewPage["cards"]>();
  for (const card of page.cards) {
    const grupo = linhas.get(card.y) ?? [];
    grupo.push(card);
    linhas.set(card.y, grupo);
  }

  const out: FundoDoCard[] = [];
  for (const [y, linha] of linhas) {
    const molde = linha[0].cardTemplate;
    const f = molde.borda.fundo;
    const raio = (molde.borda.raio ?? 0) * page.cardScale;
    const uniforme = linha.every((c) => c.cardTemplate === molde);

    if (f?.ativo && uniforme && touching && raio <= 0 && linha.length > 1) {
      const primeiro = linha[0];
      const ultimo = linha[linha.length - 1];
      out.push({
        x: margens.left + primeiro.x,
        y: margens.top + y,
        w: ultimo.x + ultimo.width - primeiro.x,
        h: primeiro.height,
        cor: f.cor,
        opacidade: f.opacidade,
        raio: 0,
      });
      continue;
    }

    for (const card of linha) {
      const fc = card.cardTemplate.borda.fundo;
      if (!fc?.ativo) continue;
      out.push({
        x: margens.left + card.x,
        y: margens.top + card.y,
        w: card.width,
        h: card.height,
        cor: fc.cor,
        opacidade: fc.opacidade,
        raio: (card.cardTemplate.borda.raio ?? 0) * page.cardScale,
      });
    }
  }
  return out;
}

// Cards com contorno ligado E cantos arredondados: contorno fechado e
// arredondado, um por card. (Sem arredondamento, o contorno continua sendo
// as linhas retas de sempre, que respeitam a regra dos cards encostados.)
export function contornosArredondados(page: PreviewPage): ContornoDoCard[] {
  if (!page.cardTemplate) return [];
  const margens = margensDa(page);
  const out: ContornoDoCard[] = [];
  for (const card of page.cards) {
    const b = card.cardTemplate.borda;
    if (!b.ativa || !((b.raio ?? 0) > 0)) continue;
    out.push({
      x: margens.left + card.x,
      y: margens.top + card.y,
      w: card.width,
      h: card.height,
      raio: (b.raio ?? 0) * page.cardScale,
      cor: b.cor,
      opacidade: b.opacidade,
      espessura: b.espessura * page.cardScale,
    });
  }
  return out;
}

export function temCantosArredondados(borda: { raio?: number }): boolean {
  return (borda.raio ?? 0) > 0;
}
