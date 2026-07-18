"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import {
  PAGE_FIELD_DEFS,
  type Margens,
  type PageElementConfig,
  type PageFieldKey,
  type PageImageElementConfig,
  type PageLayout,
  type PageTextElementConfig,
} from "../../../core/pageConfig";
import { drawTextFit } from "@/lib/canvasText";
import { loadImage } from "@/lib/loadImage";

const PREVIEW_MAX = 480;
const MIN_BOUNDARY = 200;
const MIN_FIELD_SIZE = 20;
const ORIGIN = 24;

function computeScale(largura: number, altura: number) {
  const maior = Math.max(largura, altura);
  const scale = maior > PREVIEW_MAX ? PREVIEW_MAX / maior : 1;
  return { scale, canvasW: Math.round(largura * scale), canvasH: Math.round(altura * scale) };
}

// Mesma técnica de prévia WYSIWYG já usada no Editor de Layout do
// Ofertas e no card-molde: renderiza o texto DE VERDADE via
// drawTextFit num canvas offscreen. Cabeçalho/rodapé de página usam só
// fonte de sistema ("Arial"), igual ao card-molde.
function renderTextPreview(cfg: PageTextElementConfig, sampleText: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cfg.maxW));
  canvas.height = Math.max(1, Math.ceil(cfg.maxLines * cfg.fontSize * 1.6));
  const ctx = canvas.getContext("2d")!;
  drawTextFit(ctx, sampleText, "Arial", cfg.fontWeight, cfg.fontSize, cfg.maxW, 0, 0, cfg.color, cfg.align, cfg.maxLines);
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
function ImageFieldNode({
  fieldKey,
  cfg,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
}: NodeProps & {
  fieldKey: PageFieldKey;
  cfg: PageImageElementConfig;
  onUpdate: (patch: Partial<PageImageElementConfig>) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = cfg.url;
    // Tudo dentro do .then() (mesmo o caso "sem url") — setState direto
    // no corpo do efeito, mesmo condicional, dispara
    // react-hooks/set-state-in-effect.
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
  }, [cfg.url]);

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
  sampleText,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
}: NodeProps & {
  fieldKey: PageFieldKey;
  cfg: PageTextElementConfig;
  sampleText: string;
  onUpdate: (patch: Partial<PageTextElementConfig>) => void;
}) {
  const previewCanvas = useMemo(
    () => renderTextPreview(cfg, sampleText),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.fontWeight, sampleText]
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
            />
          ) : (
            <TextFieldNode
              key={def.key}
              fieldKey={def.key}
              cfg={layout[def.key] as PageTextElementConfig}
              sampleText={def.sampleText ?? ""}
              scale={scale}
              selected={selectedKey === def.key}
              onSelect={() => onSelect(def.key)}
              onUpdate={(patch) => updateField(def.key, patch)}
              registerRef={registerRef}
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
