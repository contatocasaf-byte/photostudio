"use client";

import { useEffect, useMemo, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect } from "react-konva";
import { CARD_FIELD_DEFS, type CardImageElementConfig, type CardTextElementConfig } from "../../core/cardConfig";
import { PAGE_FIELD_DEFS, substitutePlaceholders, type PageImageElementConfig, type PageTextElementConfig } from "../../core/pageConfig";
import { resolveProductFieldText, type PreviewPage } from "../../core/reflow";
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

function renderTextCanvas(text: string, cfg: CardTextElementConfig | PageTextElementConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cfg.maxW));
  canvas.height = Math.max(1, Math.ceil(cfg.maxLines * cfg.fontSize * 1.6));
  const ctx = canvas.getContext("2d")!;
  drawTextFit(ctx, text, "Arial", cfg.fontWeight, cfg.fontSize, cfg.maxW, 0, 0, cfg.color, cfg.align, cfg.maxLines);
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
// produto (resolveProductFieldText), não mais texto de exemplo.
function CardTextField({
  cfg,
  text,
  originX,
  originY,
  scale,
}: {
  cfg: CardTextElementConfig;
  text: string;
  originX: number;
  originY: number;
  scale: number;
}) {
  const canvas = useMemo(
    () => renderTextCanvas(text, cfg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.fontWeight]
  );
  return (
    <KonvaImage
      image={canvas}
      x={ORIGIN + (originX + cfg.x) * scale}
      y={ORIGIN + (originY + cfg.y) * scale}
      width={cfg.maxW * scale}
      height={canvas.height * scale}
      listening={false}
    />
  );
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

            return (
              <Rect
                key={i}
                x={ORIGIN + originX * scale}
                y={ORIGIN + originY * scale}
                width={card.width * scale}
                height={card.height * scale}
                stroke="#e2e8f0"
                strokeWidth={1}
                listening={false}
              />
            );
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
                    x={ORIGIN + (originX + imgCfg.x) * scale}
                    y={ORIGIN + (originY + imgCfg.y) * scale}
                    width={imgCfg.w * scale}
                    height={imgCfg.h * scale}
                    stroke="#94a3b8"
                    dash={[6, 4]}
                    fill="rgba(148,163,184,0.12)"
                    listening={false}
                  />
                );
              }
              const textCfg = cfg as CardTextElementConfig;
              const text = resolveProductFieldText(def.key, card.product);
              if (!text) return null;
              return (
                <CardTextField
                  key={key}
                  cfg={textCfg}
                  text={text}
                  originX={originX}
                  originY={originY}
                  scale={scale}
                />
              );
            });
          })}
      </Layer>
    </Stage>
  );
}
