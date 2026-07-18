"use client";

import { useEffect, useMemo, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect, Shape as KonvaShape } from "react-konva";
import type Konva from "konva";
import { CARD_FIELD_DEFS, type CardImageElementConfig, type CardShape, type CardTextElementConfig } from "../../core/cardConfig";
import { PAGE_FIELD_DEFS, substitutePlaceholders, type PageImageElementConfig, type PageTextElementConfig } from "../../core/pageConfig";
import { resolveCardFieldDisplayText, type PreviewPage } from "../../core/reflow";
import { drawTextFit } from "@/lib/canvasText";
import { loadImage } from "@/lib/loadImage";
import { fitImageOnCanvas, loadImageToCanvas } from "@/lib/fitImageOnCanvas";

// 1000px ainda encolhia a página padrão (1240x1754) pra ~57% do
// tamanho de desenho — uma fonte de 16px virava ~9px reais, pequena
// demais pra ler por mais nítido que o traço fosse. Usuário confirmou
// que só aumentar a nitidez (pixelRatio) não resolveu, o problema era
// tamanho mesmo. 2200px cobre o tamanho de página padrão (e a maioria
// dos tamanhos customizados razoáveis) em escala 1:1 — sem encolher
// nada, cada pixel de fonte do card-molde vira 1 pixel real na tela
// (mais o `STAGE_PIXEL_RATIO` por cima, pra nitidez tipo retina). O
// teto continua existindo só como proteção contra alguém configurar um
// tamanho de página absurdamente grande (canvas gigante = trava o
// navegador) — o container já tem overflow-auto, então uma página em
// tamanho real normalmente cabe rolando.
const PREVIEW_MAX = 2200;
const STAGE_PIXEL_RATIO = 2;
const ORIGIN = 20;

function computeScale(largura: number, altura: number) {
  const maior = Math.max(largura, altura);
  const scale = maior > PREVIEW_MAX ? PREVIEW_MAX / maior : 1;
  return { scale, canvasW: Math.round(largura * scale), canvasH: Math.round(altura * scale) };
}

// Tamanho real (sem zoom) do Stage — o container (page.tsx) usa isso
// pra dimensionar o wrapper que aplica o zoom via CSS, já que o Stage
// sempre desenha em resolução verdadeira/nítida e quem encolhe/amplia
// pra caber na tela é só a apresentação (transform:scale), não o
// desenho em si (ver STAGE_PIXEL_RATIO acima — reaplicar esse encolher/
// ampliar DENTRO do Konva de novo reintroduziria o borrão de texto).
export function computeStageSize(paginaLargura: number, paginaAltura: number) {
  const { canvasW, canvasH } = computeScale(paginaLargura, paginaAltura);
  return { width: canvasW + ORIGIN * 2, height: canvasH + ORIGIN * 2 };
}

// `contentScale` encolhe maxW/fontSize antes de desenhar — usado só
// pelos campos de CARD (ver `cardScale` em PreviewPage), pra manter a
// proporção do texto quando a grade inteira precisa encolher pra caber
// na largura da página. Campos de página (header/footer) não usam
// (ficam no valor padrão 1).
//
// O bitmap é desenhado em resolução STAGE_PIXEL_RATIO vezes maior que
// o tamanho de exibição (mesma ideia do pixelRatio do Stage, mas
// aplicada manualmente aqui porque esse canvas é criado à parte,
// fora do Stage) — sem isso, o Konva precisa AMPLIAR esse bitmap pra
// caber no Stage (que desenha em alta resolução por causa do
// pixelRatio), e o algoritmo de suavização do navegador borra ou
// literalmente apaga traços finos de letras estreitas (I, J, etc.) ao
// ampliar um bitmap pequeno demais — foi isso que apareceu como
// "texto com falhas" depois de aumentar o preview pra escala 1:1.
// canvas.height sai multiplicado por STAGE_PIXEL_RATIO; quem consome
// o retorno precisa dividir de volta ao calcular a altura de exibição.
function renderTextCanvas(text: string, cfg: CardTextElementConfig | PageTextElementConfig, contentScale = 1): HTMLCanvasElement {
  const maxW = cfg.maxW * contentScale * STAGE_PIXEL_RATIO;
  const fontSize = cfg.fontSize * contentScale * STAGE_PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(maxW));
  canvas.height = Math.max(1, Math.ceil(cfg.maxLines * fontSize * 1.6));
  const ctx = canvas.getContext("2d")!;
  // minSize padrão (8) é calibrado pro espaço de desenho normal — aqui
  // fontSize já veio inflado por STAGE_PIXEL_RATIO, então o piso
  // precisa acompanhar, senão o fallback de "não coube nem encolhendo"
  // desenha texto comicamente pequeno (equivalente a uns 4px reais),
  // fino demais pra renderizar sem corromper glifos estreitos (I/J/T)
  // — foi o que sobrou de errado depois da correção de resolução do
  // bitmap: textos longos demais pra caber cain nesse fallback.
  drawTextFit(ctx, text, "Arial", cfg.fontWeight, fontSize, maxW, 0, 0, cfg.color, cfg.align, cfg.maxLines, 1.15, 8 * STAGE_PIXEL_RATIO);
  return canvas;
}

// Campo de imagem do cabeçalho/rodapé da página — só leitura (sem
// Transformer/drag), com o mesmo encaixe "contentFit" (sem cortar
// objeto visível) já usado no editor pra ilustração/logo.
function PageImageField({ cfg, scale }: { cfg: PageImageElementConfig; scale: number }) {
  const [img, setImg] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = cfg.url;
    const task = !url ? Promise.resolve(null) : loadImageToCanvas(url).then((source) => fitImageOnCanvas(source, cfg.w, cfg.h));
    task
      .then((loaded) => {
        if (!cancelled) setImg(loaded);
      })
      .catch(() => {
        if (!cancelled) setImg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg.url, cfg.w, cfg.h]);

  if (!img) return null;
  return (
    <KonvaImage
      image={img}
      x={ORIGIN + cfg.x * scale}
      y={ORIGIN + cfg.y * scale}
      width={cfg.w * scale}
      height={cfg.h * scale}
      listening={false}
    />
  );
}

function PageTextField({ cfg, text, scale }: { cfg: PageTextElementConfig; text: string; scale: number }) {
  const canvas = useMemo(
    () => renderTextCanvas(text, cfg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.fontWeight]
  );
  return (
    <KonvaImage
      image={canvas}
      x={ORIGIN + cfg.x * scale}
      y={ORIGIN + cfg.y * scale}
      width={cfg.maxW * scale}
      height={(canvas.height / STAGE_PIXEL_RATIO) * scale}
      listening={false}
    />
  );
}

// Foto real do produto (Fase 5, Parte 7 — galeria via Google Drive) —
// mesmo padrão de carregar+encaixar sem cortar de PageImageField.
// Enquanto carrega ou se o carregamento falhar (foto removida da
// pasta, sessão expirada, etc.), cai pro mesmo placeholder tracejado
// que já existia — nunca deixa o card sem nada nessa área.
function CardPhotoField({
  fotoUrl,
  imgCfg,
  originX,
  originY,
  scale,
  cardScale,
}: {
  fotoUrl: string;
  imgCfg: CardImageElementConfig;
  originX: number;
  originY: number;
  scale: number;
  cardScale: number;
}) {
  const [img, setImg] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const w = imgCfg.w * cardScale;
    const h = imgCfg.h * cardScale;
    loadImageToCanvas(fotoUrl)
      .then((source) => fitImageOnCanvas(source, w, h))
      .then((loaded) => {
        if (!cancelled) setImg(loaded);
      })
      .catch(() => {
        if (!cancelled) setImg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fotoUrl, imgCfg.w, imgCfg.h, cardScale]);

  const x = ORIGIN + (originX + imgCfg.x * cardScale) * scale;
  const y = ORIGIN + (originY + imgCfg.y * cardScale) * scale;
  const width = imgCfg.w * cardScale * scale;
  const height = imgCfg.h * cardScale * scale;

  if (!img) {
    return (
      <Rect x={x} y={y} width={width} height={height} stroke="#94a3b8" dash={[6, 4]} fill="rgba(148,163,184,0.12)" listening={false} />
    );
  }

  return <KonvaImage image={img} x={x} y={y} width={width} height={height} listening={false} />;
}

function PageBackground({ url, canvasW, canvasH }: { url: string | null; canvasW: number; canvasH: number }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(url ? loadImage(url) : null)
      .then((loaded) => {
        if (!cancelled) setImg(loaded);
      })
      .catch(() => {
        if (!cancelled) setImg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!img) return null;
  return <KonvaImage image={img} x={ORIGIN} y={ORIGIN} width={canvasW} height={canvasH} listening={false} />;
}

// Campo de TEXTO de um card posicionado na grade — dado REAL do
// produto, já com o rótulo do template aplicado (resolveCardFieldDisplayText),
// não mais texto de exemplo.
function CardTextField({
  cfg,
  text,
  originX,
  originY,
  scale,
  cardScale,
}: {
  cfg: CardTextElementConfig;
  text: string;
  originX: number;
  originY: number;
  scale: number;
  cardScale: number;
}) {
  const canvas = useMemo(
    () => renderTextCanvas(text, cfg, cardScale),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.fontWeight, cardScale]
  );
  return (
    <KonvaImage
      image={canvas}
      x={ORIGIN + (originX + cfg.x * cardScale) * scale}
      y={ORIGIN + (originY + cfg.y * cardScale) * scale}
      width={cfg.maxW * cardScale * scale}
      height={(canvas.height / STAGE_PIXEL_RATIO) * scale}
      listening={false}
    />
  );
}

// Forma decorativa de um card posicionado na grade — mesmo desenho do
// ShapeNode do editor (retângulo nativo do Konva; elipse/triângulo via
// sceneFunc de Canvas 2D), só que somente leitura (sem drag/Transformer).
function PreviewCardShape({
  shape,
  originX,
  originY,
  scale,
  cardScale,
}: {
  shape: CardShape;
  originX: number;
  originY: number;
  scale: number;
  cardScale: number;
}) {
  // "Sangria" de 1px em volta — sem isso, uma forma desenhada pra
  // encostar exatamente na vizinha do card ao lado (ex.: barra de cor
  // contínua atravessando vários cards) deixa uma linha fina visível na
  // costura: as coordenadas de cada card passam por várias
  // multiplicações (cardScale, scale) e raramente caem num pixel
  // inteiro igual nos dois lados, então o canvas antialiasa a borda de
  // cada forma separadamente e sobra um fio de fundo branco entre elas.
  // Estender 1px pra cada lado garante sobreposição (imperceptível a
  // olho nu) em vez de depender de arredondamento coincidir.
  const BLEED = 1;
  const x = ORIGIN + (originX + shape.x * cardScale) * scale - BLEED / 2;
  const y = ORIGIN + (originY + shape.y * cardScale) * scale - BLEED / 2;
  const width = shape.w * cardScale * scale + BLEED;
  const height = shape.h * cardScale * scale + BLEED;
  const common = { x, y, width, height, fill: shape.color, opacity: shape.opacity, listening: false };

  if (shape.type === "retangulo") {
    return <Rect {...common} />;
  }

  const sceneFunc =
    shape.type === "elipse"
      ? (ctx: Konva.Context, node: Konva.Shape) => {
          const w = node.width();
          const h = node.height();
          ctx.beginPath();
          ctx.ellipse(w / 2, h / 2, Math.max(0.01, w / 2), Math.max(0.01, h / 2), 0, 0, Math.PI * 2);
          ctx.closePath();
          ctx.fillStrokeShape(node);
        }
      : (ctx: Konva.Context, node: Konva.Shape) => {
          const w = node.width();
          const h = node.height();
          ctx.beginPath();
          ctx.moveTo(w / 2, 0);
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.fillStrokeShape(node);
        };

  return <KonvaShape {...common} sceneFunc={sceneFunc} />;
}

export type PreviewPageCanvasProps = {
  page: PreviewPage;
  paginaLargura: number;
  paginaAltura: number;
  numeroPagina: number;
};

// Desenha UMA página do catálogo montado — fundo + cabeçalho/rodapé do
// page_template (com {secao_titulo}/{pagina} substituídos por valores
// reais) + grade de cards com dado real do produto. Somente leitura,
// nenhuma interação (sem Transformer/drag) — é preview, não editor.
export default function PreviewPageCanvas({ page, paginaLargura, paginaAltura, numeroPagina }: PreviewPageCanvasProps) {
  const { scale, canvasW, canvasH } = computeScale(paginaLargura, paginaAltura);
  const margens = page.pageTemplate?.margens ?? { top: 0, right: 0, bottom: 0, left: 0 };

  const placeholderValues: Record<string, string> = {
    secao_titulo: page.sectionTitulo ?? "",
    pagina: String(numeroPagina),
  };

  return (
    <Stage width={canvasW + ORIGIN * 2} height={canvasH + ORIGIN * 2} pixelRatio={STAGE_PIXEL_RATIO}>
      <Layer>
        <Rect x={ORIGIN} y={ORIGIN} width={canvasW} height={canvasH} fill="#ffffff" stroke="#e2e8f0" strokeWidth={1} />

        <PageBackground url={page.pageTemplate?.fundoUrl ?? null} canvasW={canvasW} canvasH={canvasH} />

        {page.pageTemplate &&
          PAGE_FIELD_DEFS.filter((d) => page.pageTemplate!.elementosHabilitados.includes(d.key)).map((def) => {
            const cfg = page.pageTemplate!.layout[def.key];
            if (!cfg) return null;
            if (def.type === "image") {
              return <PageImageField key={def.key} cfg={cfg as PageImageElementConfig} scale={scale} />;
            }
            const textCfg = cfg as PageTextElementConfig;
            const text = substitutePlaceholders(textCfg.text ?? "", placeholderValues);
            return <PageTextField key={def.key} cfg={textCfg} text={text} scale={scale} />;
          })}

        {page.cardTemplate &&
          page.cards.flatMap((card, i) => {
            // Estrutura da grade (touching/gutter) sempre vem da versão
            // ATUAL da seção; o ESTILO do contorno (cor/espessura/ativa)
            // vem do molde resolvido pra ESTE card (spec 3.5) — um item
            // antigo pode ter o contorno desligado mesmo que a versão
            // atual tenha ligado, por exemplo.
            const cardTemplateAtual = page.cardTemplate!;
            const borda = card.cardTemplate.borda;
            if (!borda.ativa) return [];

            const originX = margens.left + card.x;
            const originY = margens.top + card.y;
            const x0 = ORIGIN + originX * scale;
            const y0 = ORIGIN + originY * scale;
            const x1 = x0 + card.width * scale;
            const y1 = y0 + card.height * scale;

            // Cards desenhados encostados (gutterX = largura, sem
            // espaço visível entre colunas — usado pra criar faixas de
            // cor contínuas com formas) não podem ter a lateral
            // interna desenhada: cada card desenharia sua própria borda
            // bem no meio da faixa, quebrando a continuidade. Só a
            // lateral esquerda do primeiro card e a direita do último
            // de cada linha (a moldura externa) continuam aparecendo.
            const touching = Math.abs(cardTemplateAtual.gutterX - cardTemplateAtual.largura) < 0.5;
            const drawLeft = !touching || card.isFirstCol;
            const drawRight = !touching || card.isLastCol;

            const segments: [number, number, number, number][] = [
              [x0, y0, x1, y0],
              [x0, y1, x1, y1],
            ];
            if (drawLeft) segments.push([x0, y0, x0, y1]);
            if (drawRight) segments.push([x1, y0, x1, y1]);

            return segments.map((points, si) => (
              <Line
                key={`${i}-${si}`}
                points={points}
                stroke={borda.cor}
                strokeWidth={borda.espessura * page.cardScale * scale}
                opacity={borda.opacidade}
                listening={false}
              />
            ));
          })}

        {page.cardTemplate &&
          page.cards.length > 0 &&
          (() => {
            const cardTemplateAtual = page.cardTemplate!;
            const cardScale = page.cardScale;
            const touchingX = Math.abs(cardTemplateAtual.gutterX - cardTemplateAtual.largura) < 0.5;

            // Agrupa por linha (mesmo Y) — quando os cards estão
            // encostados (gutterX = largura) e um retângulo alcança a
            // borda do card, desenhar ele uma vez POR CARD deixa uma
            // costura visível mesmo com sangria: dois preenchimentos
            // antialiasados desenhados separadamente, mesmo perfeitamente
            // alinhados/sobrepostos, não se compõem a 100% de cobertura
            // igual a um preenchimento único — sobra uma linha mais clara
            // (formas opacas) ou mais escura (formas semitransparentes,
            // pela dupla composição) bem na emenda. A única forma de
            // eliminar de vez é desenhar UM retângulo só cobrindo a linha
            // inteira, em vez de N retângulos encostados.
            const linhas = new Map<number, typeof page.cards>();
            for (const card of page.cards) {
              const grupo = linhas.get(card.y) ?? [];
              grupo.push(card);
              linhas.set(card.y, grupo);
            }

            return [...linhas.entries()].flatMap(([y, linha], li) => {
              // Fundir só funciona se a linha inteira compartilha o
              // MESMO molde (spec 3.5 permite molde v1 ao lado de v2 na
              // mesma linha, numa seção em transição logo após "aplicar
              // só aos novos") — reflow.ts resolve por versão a partir
              // de um Map compartilhado, então cards da mesma versão
              // têm a mesma instância de cardTemplate (comparável por
              // referência). Linha mista desenha cada forma por card
              // (sangria de 1px como fallback, ver PreviewCardShape).
              const uniforme = linha.every((c) => c.cardTemplate === linha[0].cardTemplate);
              if (!uniforme) {
                return linha.flatMap((card) =>
                  card.cardTemplate.shapes.map((shape) => (
                    <PreviewCardShape
                      key={`${card.product.id}-${shape.id}`}
                      shape={shape}
                      originX={margens.left + card.x}
                      originY={margens.top + card.y}
                      scale={scale}
                      cardScale={cardScale}
                    />
                  ))
                );
              }

              const template = linha[0].cardTemplate;
              return template.shapes.flatMap((shape, si) => {
                const encostaNaBorda = shape.type === "retangulo" && shape.x + shape.w >= cardTemplateAtual.gutterX - 0.5;
                if (touchingX && encostaNaBorda && linha.length > 1) {
                  const primeiro = linha[0];
                  const ultimo = linha[linha.length - 1];
                  const x0 = ORIGIN + (margens.left + primeiro.x + shape.x * cardScale) * scale;
                  const x1 = ORIGIN + (margens.left + ultimo.x + shape.x * cardScale + shape.w * cardScale) * scale;
                  const yTop = ORIGIN + (margens.top + y + shape.y * cardScale) * scale;
                  return [
                    <Rect
                      key={`${li}-${si}`}
                      x={x0}
                      y={yTop}
                      width={x1 - x0}
                      height={shape.h * cardScale * scale}
                      fill={shape.color}
                      opacity={shape.opacity}
                      listening={false}
                    />,
                  ];
                }
                return linha.map((card) => (
                  <PreviewCardShape
                    key={`${card.product.id}-${shape.id}`}
                    shape={shape}
                    originX={margens.left + card.x}
                    originY={margens.top + card.y}
                    scale={scale}
                    cardScale={cardScale}
                  />
                ));
              });
            });
          })()}

        {page.cardTemplate &&
          page.cards.flatMap((card) => {
            // Conteúdo visual (campos habilitados, layout de cada um)
            // vem do molde resolvido pra ESTE card (spec 3.5), não da
            // versão atual da seção.
            const cardTemplate = card.cardTemplate;
            const originX = margens.left + card.x;
            const originY = margens.top + card.y;

            return CARD_FIELD_DEFS.filter((d) => cardTemplate.camposHabilitados.includes(d.key)).map((def) => {
              const cfg = cardTemplate.layout[def.key];
              if (!cfg) return null;
              const key = `${card.product.id}-${def.key}`;
              if (def.type === "image") {
                const imgCfg = cfg as CardImageElementConfig;
                if (!card.product.fotoUrl) {
                  return (
                    <Rect
                      key={key}
                      x={ORIGIN + (originX + imgCfg.x * page.cardScale) * scale}
                      y={ORIGIN + (originY + imgCfg.y * page.cardScale) * scale}
                      width={imgCfg.w * page.cardScale * scale}
                      height={imgCfg.h * page.cardScale * scale}
                      stroke="#94a3b8"
                      dash={[6, 4]}
                      fill="rgba(148,163,184,0.12)"
                      listening={false}
                    />
                  );
                }
                return (
                  <CardPhotoField
                    key={key}
                    fotoUrl={card.product.fotoUrl}
                    imgCfg={imgCfg}
                    originX={originX}
                    originY={originY}
                    scale={scale}
                    cardScale={page.cardScale}
                  />
                );
              }
              const textCfg = cfg as CardTextElementConfig;
              const text = resolveCardFieldDisplayText(def.key, textCfg, card.product);
              if (!text) return null;
              return (
                <CardTextField
                  key={key}
                  cfg={textCfg}
                  text={text}
                  originX={originX}
                  originY={originY}
                  scale={scale}
                  cardScale={page.cardScale}
                />
              );
            });
          })}
      </Layer>
    </Stage>
  );
}
