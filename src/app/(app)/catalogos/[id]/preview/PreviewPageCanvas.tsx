"use client";

import { useEffect, useMemo, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Shape as KonvaShape } from "react-konva";
import type Konva from "konva";
import { CARD_FIELD_DEFS, type CardImageElementConfig, type CardShape, type CardTextElementConfig } from "../../core/cardConfig";
import { PAGE_FIELD_DEFS, substitutePlaceholders, type PageImageElementConfig, type PageTextElementConfig } from "../../core/pageConfig";
import { resolveCardFieldDisplayText, type PreviewPage } from "../../core/reflow";
import { drawTextFit } from "@/lib/canvasText";
import { loadImage } from "@/lib/loadImage";
import { fitImageOnCanvas, loadImageToCanvas } from "@/lib/fitImageOnCanvas";

const PREVIEW_MAX = 700;
const ORIGIN = 20;

function computeScale(largura: number, altura: number) {
  const maior = Math.max(largura, altura);
  const scale = maior > PREVIEW_MAX ? PREVIEW_MAX / maior : 1;
  return { scale, canvasW: Math.round(largura * scale), canvasH: Math.round(altura * scale) };
}

// `contentScale` encolhe maxW/fontSize antes de desenhar — usado só
// pelos campos de CARD (ver `cardScale` em PreviewPage), pra manter a
// proporção do texto quando a grade inteira precisa encolher pra caber
// na largura da página. Campos de página (header/footer) não usam
// (ficam no valor padrão 1).
function renderTextCanvas(text: string, cfg: CardTextElementConfig | PageTextElementConfig, contentScale = 1): HTMLCanvasElement {
  const maxW = cfg.maxW * contentScale;
  const fontSize = cfg.fontSize * contentScale;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(maxW));
  canvas.height = Math.max(1, Math.ceil(cfg.maxLines * fontSize * 1.6));
  const ctx = canvas.getContext("2d")!;
  drawTextFit(ctx, text, "Arial", cfg.fontWeight, fontSize, maxW, 0, 0, cfg.color, cfg.align, cfg.maxLines);
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
      height={canvas.height * scale}
      listening={false}
    />
  );
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
      height={canvas.height * scale}
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
    <Stage width={canvasW + ORIGIN * 2} height={canvasH + ORIGIN * 2}>
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
          page.cards.map((card, i) => {
            const originX = margens.left + card.x;
            const originY = margens.top + card.y;

            const borda = page.cardTemplate!.borda;
            if (!borda.ativa) return null;

            return (
              <Rect
                key={i}
                x={ORIGIN + originX * scale}
                y={ORIGIN + originY * scale}
                width={card.width * scale}
                height={card.height * scale}
                stroke={borda.cor}
                strokeWidth={borda.espessura * page.cardScale * scale}
                opacity={borda.opacidade}
                listening={false}
              />
            );
          })}

        {page.cardTemplate &&
          page.cardTemplate.shapes.length > 0 &&
          page.cards.flatMap((card) => {
            const originX = margens.left + card.x;
            const originY = margens.top + card.y;
            return page.cardTemplate!.shapes.map((shape) => (
              <PreviewCardShape
                key={`${card.product.id}-${shape.id}`}
                shape={shape}
                originX={originX}
                originY={originY}
                scale={scale}
                cardScale={page.cardScale}
              />
            ));
          })}

        {page.cardTemplate &&
          page.cards.flatMap((card) => {
            const cardTemplate = page.cardTemplate!;
            const originX = margens.left + card.x;
            const originY = margens.top + card.y;

            return CARD_FIELD_DEFS.filter((d) => cardTemplate.camposHabilitados.includes(d.key)).map((def) => {
              const cfg = cardTemplate.layout[def.key];
              if (!cfg) return null;
              const key = `${card.product.id}-${def.key}`;
              if (def.type === "image") {
                const imgCfg = cfg as CardImageElementConfig;
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
