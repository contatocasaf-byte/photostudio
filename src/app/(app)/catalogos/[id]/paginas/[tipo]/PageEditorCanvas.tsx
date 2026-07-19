"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import {
  DEFAULT_FONT_FAMILY,
  fontPairsFromPageLayout,
  PAGE_FIELD_DEFS,
  substitutePlaceholders,
  type Margens,
  type PageElementConfig,
  type PageFieldKey,
  type PageImageElementConfig,
  type PageLayout,
  type PageTextElementConfig,
} from "../../../core/pageConfig";
import { drawTextFit } from "@/lib/canvasText";
import { loadImage } from "@/lib/loadImage";
import { fitImageOnCanvas, loadImageToCanvas } from "@/lib/fitImageOnCanvas";
import { ensureFontsLoaded } from "@/lib/fonts/fontLoader";

const PREVIEW_MAX = 480;
const MIN_BOUNDARY = 200;
const MIN_FIELD_SIZE = 20;
const ORIGIN = 24;

// Valores de exemplo só pro preview WYSIWYG do editor (banner_titulo e
// numeração não têm um valor fixo — dependem da seção/página real, só
// existentes na tela de preview de verdade, não aqui).
const PAGE_PREVIEW_SAMPLE_VALUES: Record<string, string> = { secao_titulo: "Nome da Seção", pagina: "1" };

function computeScale(largura: number, altura: number) {
  const maior = Math.max(largura, altura);
  const scale = maior > PREVIEW_MAX ? PREVIEW_MAX / maior : 1;
  return { scale, canvasW: Math.round(largura * scale), canvasH: Math.round(altura * scale) };
}

// Mesma técnica de prévia WYSIWYG já usada no Editor de Layout do
// Ofertas e no card-molde: renderiza o texto DE VERDADE via
// drawTextFit num canvas offscreen. Fonte real da biblioteca (Fase 5,
// Parte 11) — cai pro padrão em modelo de página salvo antes dessa
// parte, que não tem `fontFamily` gravado.
function renderTextPreview(cfg: PageTextElementConfig, sampleText: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cfg.maxW));
  canvas.height = Math.max(1, Math.ceil(cfg.maxLines * cfg.fontSize * 1.6));
  const ctx = canvas.getContext("2d")!;
  drawTextFit(
    ctx,
    sampleText,
    cfg.fontFamily ?? DEFAULT_FONT_FAMILY,
    cfg.fontWeight,
    cfg.fontSize,
    cfg.maxW,
    0,
    0,
    cfg.color,
    cfg.align,
    cfg.maxLines
  );
  return canvas;
}

type NodeProps = {
  scale: number;
  selected: boolean;
  onSelect: () => void;
  registerRef: (key: PageFieldKey, node: Konva.Node | null) => void;
};

// Campos de imagem (ilustração/logo) carregam um asset real enviado
// pro R2 — mostra o arquivo carregado quando `url` existir, senão um
// placeholder tracejado (mesmo tratamento visual do campo "foto" do
// card-molde, só que aqui é temporário até o usuário enviar o
// arquivo, não permanente).
//
// `contentFit` (Ilustração e Logo) reaproveita o mesmo encaixe "sem
// cortar o objeto visível" já usado nas fotos de produto do Gerador de
// Ofertas (fitImageOnCanvas, agora em src/lib/) — ignora a margem
// transparente ao redor do objeto num PNG e centraliza pelo conteúdo
// opaco, ocupando ~85-90% do quadro, sem esticar/distorcer.
function ImageFieldNode({
  fieldKey,
  cfg,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
  contentFit = false,
}: NodeProps & {
  fieldKey: PageFieldKey;
  cfg: PageImageElementConfig;
  onUpdate: (patch: Partial<PageImageElementConfig>) => void;
  contentFit?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = cfg.url;
    // Tudo dentro do .then() (mesmo o caso "sem url") — setState direto
    // no corpo do efeito, mesmo condicional, dispara
    // react-hooks/set-state-in-effect.
    const task: Promise<HTMLImageElement | HTMLCanvasElement | null> = !url
      ? Promise.resolve(null)
      : contentFit
        ? loadImageToCanvas(url).then((source) => fitImageOnCanvas(source, cfg.w, cfg.h))
        : loadImage(url);
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
  }, [cfg.url, cfg.w, cfg.h, contentFit]);

  const x = ORIGIN + cfg.x * scale;
  const y = ORIGIN + cfg.y * scale;
  const width = cfg.w * scale;
  const height = cfg.h * scale;

  function handleDrag(e: Konva.KonvaEventObject<DragEvent>) {
    onUpdate({ x: Math.round((e.target.x() - ORIGIN) / scale), y: Math.round((e.target.y() - ORIGIN) / scale) });
  }

  function handleTransform(e: Konva.KonvaEventObject<Event>) {
    const node = e.target;
    const newW = Math.max(MIN_FIELD_SIZE, Math.round((node.width() * node.scaleX()) / scale));
    const newH = Math.max(MIN_FIELD_SIZE, Math.round((node.height() * node.scaleY()) / scale));
    node.scaleX(1);
    node.scaleY(1);
    node.width(newW * scale);
    node.height(newH * scale);
    onUpdate({ w: newW, h: newH, x: Math.round((node.x() - ORIGIN) / scale), y: Math.round((node.y() - ORIGIN) / scale) });
  }

  if (img) {
    return (
      <KonvaImage
        ref={(node) => registerRef(fieldKey, node)}
        image={img}
        x={x}
        y={y}
        width={width}
        height={height}
        stroke={selected ? "#4fc3f7" : undefined}
        strokeWidth={selected ? 3 : 0}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={handleDrag}
        onDragEnd={handleDrag}
        onTransform={handleTransform}
      />
    );
  }

  return (
    <Rect
      ref={(node) => registerRef(fieldKey, node)}
      x={x}
      y={y}
      width={width}
      height={height}
      stroke="#4fc3f7"
      strokeWidth={selected ? 3 : 2}
      dash={[6, 4]}
      fill="rgba(79,195,247,0.08)"
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={handleDrag}
      onDragEnd={handleDrag}
      onTransform={handleTransform}
    />
  );
}

function TextFieldNode({
  fieldKey,
  cfg,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
  fontsTick,
}: NodeProps & {
  fieldKey: PageFieldKey;
  cfg: PageTextElementConfig;
  onUpdate: (patch: Partial<PageTextElementConfig>) => void;
  fontsTick: number;
}) {
  // fontsTick força recalcular quando uma fonte termina de carregar
  // depois do primeiro desenho (ver ensureFontsLoaded no componente
  // principal) — mesmo padrão do card-molde/Editor de Layout do Ofertas.
  const previewCanvas = useMemo(
    () => renderTextPreview(cfg, substitutePlaceholders(cfg.text ?? "", PAGE_PREVIEW_SAMPLE_VALUES)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.text, cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.fontWeight, cfg.fontFamily, fontsTick]
  );

  return (
    <KonvaImage
      ref={(node) => registerRef(fieldKey, node)}
      image={previewCanvas}
      x={ORIGIN + cfg.x * scale}
      y={ORIGIN + cfg.y * scale}
      width={cfg.maxW * scale}
      height={previewCanvas.height * scale}
      stroke={selected ? "#4fc3f7" : undefined}
      strokeWidth={selected ? 2 : 0}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) =>
        onUpdate({ x: Math.round((e.target.x() - ORIGIN) / scale), y: Math.round((e.target.y() - ORIGIN) / scale) })
      }
      onDragEnd={(e) =>
        onUpdate({ x: Math.round((e.target.x() - ORIGIN) / scale), y: Math.round((e.target.y() - ORIGIN) / scale) })
      }
      onTransform={(e) => {
        const node = e.target;
        const newMaxW = Math.max(MIN_FIELD_SIZE, Math.round((node.width() * node.scaleX()) / scale));
        node.scaleX(1);
        node.scaleY(1);
        onUpdate({ maxW: newMaxW, x: Math.round((node.x() - ORIGIN) / scale) });
      }}
    />
  );
}

// Boundary = tamanho da página (compartilhado por todo o catálogo, ver
// decisão na Parte 3 do plano). Fixo em (0,0), só redimensionável
// (Transformer próprio, 4 cantos + 4 pontos médios) — mesmo padrão já
// usado no card-molde. `keepRatio` (default do Konva, true) só afeta
// os cantos: mantêm a proporção altura×largura. Os pontos médios
// (top-center/bottom-center/middle-left/middle-right) já redimensionam
// só um eixo por conta própria, com ou sem keepRatio — não precisa (e
// não deve) desligar via `keepRatio={false}`, senão os CANTOS também
// perdem o travamento de proporção.
function BoundaryRect({
  canvasW,
  canvasH,
  scale,
  onResize,
  transformerRef,
}: {
  canvasW: number;
  canvasH: number;
  scale: number;
  onResize: (patch: { largura: number; altura: number }) => void;
  transformerRef: RefObject<Konva.Transformer | null>;
}) {
  const rectRef = useRef<Konva.Rect>(null);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr || !rectRef.current) return;
    tr.nodes([rectRef.current]);
    tr.getLayer()?.batchDraw();
  }, [transformerRef]);

  return (
    <>
      <Rect
        ref={rectRef}
        x={ORIGIN}
        y={ORIGIN}
        width={canvasW}
        height={canvasH}
        fill="#ffffff"
        stroke="#94a3b8"
        strokeWidth={1.5}
        dash={[4, 4]}
        onTransform={(e) => {
          const node = e.target;
          const newLargura = Math.max(MIN_BOUNDARY, Math.round((node.width() * node.scaleX()) / scale));
          const newAltura = Math.max(MIN_BOUNDARY, Math.round((node.height() * node.scaleY()) / scale));
          node.scaleX(1);
          node.scaleY(1);
          // O boundary fica sempre fixo em (ORIGIN, ORIGIN) — arrastar
          // pelo canto/ponto médio superior-esquerdo faz o Konva mover
          // x/y pra manter o lado oposto fixo (comportamento padrão de
          // resize). Sem essa correção a cada tick do arraste, esse
          // deslocamento se acumula e degringola pra valores absurdos
          // (largura/altura na casa das dezenas de milhares de px).
          node.x(ORIGIN);
          node.y(ORIGIN);
          node.width(newLargura * scale);
          node.height(newAltura * scale);
          onResize({ largura: newLargura, altura: newAltura });
        }}
      />
      <Transformer
        ref={transformerRef}
        enabledAnchors={[
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
          "top-center",
          "bottom-center",
          "middle-left",
          "middle-right",
        ]}
        rotateEnabled={false}
        keepRatio={true}
        boundBoxFunc={(oldBox, newBox) => {
          if (Math.abs(newBox.width) < MIN_BOUNDARY * scale || Math.abs(newBox.height) < MIN_BOUNDARY * scale) return oldBox;
          return newBox;
        }}
      />
    </>
  );
}

// Plano de fundo cobrindo a página inteira (textura, moldura
// decorativa, arte de seção) — ao contrário dos campos de cabeçalho/
// rodapé, não é posicionável/redimensionável: sempre preenche o
// boundary inteiro, esticando se a proporção do arquivo não bater
// exatamente (mesmo tratamento do "layout" do Gerador de Ofertas, que
// também sempre preenche o canvas por completo).
function BackgroundImage({ url, canvasW, canvasH }: { url: string | null; canvasW: number; canvasH: number }) {
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

export type PageEditorCanvasProps = {
  layout: PageLayout;
  onLayoutChange: (updater: (prev: PageLayout) => PageLayout) => void;
  elementosHabilitados: PageFieldKey[];
  largura: number;
  altura: number;
  onResizeBoundary: (patch: { largura: number; altura: number }) => void;
  margens: Margens;
  fundoUrl: string | null;
  selectedKey: PageFieldKey | null;
  onSelect: (key: PageFieldKey | null) => void;
};

export default function PageEditorCanvas({
  layout,
  onLayoutChange,
  elementosHabilitados,
  largura,
  altura,
  onResizeBoundary,
  margens,
  fundoUrl,
  selectedKey,
  onSelect,
}: PageEditorCanvasProps) {
  const { scale, canvasW, canvasH } = computeScale(largura, altura);

  const nodeRefs = useRef<Partial<Record<PageFieldKey, Konva.Node>>>({});
  const fieldTransformerRef = useRef<Konva.Transformer>(null);
  const boundaryTransformerRef = useRef<Konva.Transformer>(null);
  const [fontsTick, setFontsTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    ensureFontsLoaded(fontPairsFromPageLayout(layout)).then(() => {
      if (!cancelled) setFontsTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [layout]);

  function registerRef(key: PageFieldKey, node: Konva.Node | null) {
    if (node) nodeRefs.current[key] = node;
  }

  useEffect(() => {
    const tr = fieldTransformerRef.current;
    if (!tr) return;
    const node = selectedKey ? nodeRefs.current[selectedKey] : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  });

  function updateField<K extends PageFieldKey>(key: K, patch: PageElementConfig) {
    onLayoutChange((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const selectedDef = selectedKey ? PAGE_FIELD_DEFS.find((d) => d.key === selectedKey) : null;
  const stageW = canvasW + ORIGIN * 2;
  const stageH = canvasH + ORIGIN * 2;

  const marginRect = {
    x: ORIGIN + margens.left * scale,
    y: ORIGIN + margens.top * scale,
    width: Math.max(0, canvasW - (margens.left + margens.right) * scale),
    height: Math.max(0, canvasH - (margens.top + margens.bottom) * scale),
  };

  return (
    <Stage
      width={stageW}
      height={stageH}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
      onTap={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
    >
      <Layer>
        <BoundaryRect
          canvasW={canvasW}
          canvasH={canvasH}
          scale={scale}
          onResize={onResizeBoundary}
          transformerRef={boundaryTransformerRef}
        />

        <BackgroundImage url={fundoUrl} canvasW={canvasW} canvasH={canvasH} />

        <Rect {...marginRect} stroke="#f59e0b" strokeWidth={1} dash={[3, 3]} listening={false} />

        {PAGE_FIELD_DEFS.filter((d) => elementosHabilitados.includes(d.key)).map((def) =>
          def.type === "image" ? (
            <ImageFieldNode
              key={def.key}
              fieldKey={def.key}
              cfg={layout[def.key] as PageImageElementConfig}
              scale={scale}
              selected={selectedKey === def.key}
              onSelect={() => onSelect(def.key)}
              onUpdate={(patch) => updateField(def.key, patch)}
              registerRef={registerRef}
              contentFit={def.key === "ilustracao" || def.key === "logo"}
            />
          ) : (
            <TextFieldNode
              key={def.key}
              fieldKey={def.key}
              cfg={layout[def.key] as PageTextElementConfig}
              scale={scale}
              selected={selectedKey === def.key}
              onSelect={() => onSelect(def.key)}
              onUpdate={(patch) => updateField(def.key, patch)}
              registerRef={registerRef}
              fontsTick={fontsTick}
            />
          )
        )}

        <Transformer
          ref={fieldTransformerRef}
          enabledAnchors={
            selectedDef?.type === "image"
              ? [
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                  "top-center",
                  "bottom-center",
                  "middle-left",
                  "middle-right",
                ]
              : ["middle-left", "middle-right"]
          }
          rotateEnabled={false}
          keepRatio={true}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < MIN_FIELD_SIZE || Math.abs(newBox.height) < MIN_FIELD_SIZE) return oldBox;
            return newBox;
          }}
        />
      </Layer>
    </Stage>
  );
}
