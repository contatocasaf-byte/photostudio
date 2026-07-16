"use client";

import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Line, Transformer } from "react-konva";
import type Konva from "konva";
import {
  ELEMENT_DEFS,
  type ElementKey,
  type ImageElementConfig,
  type LayoutConfig,
  type TextElementConfig,
} from "../core/layoutConfig";
import { drawTextFit } from "../core/renderOffer";

const PREVIEW_MAX = 640;
const MIN_BOX = 20;
const MIN_MAX_W = 40;

type Props = {
  layoutImg: HTMLImageElement;
  config: LayoutConfig;
  onConfigChange: Dispatch<SetStateAction<LayoutConfig>>;
  selectedKey: ElementKey | null;
  onSelect: (key: ElementKey | null) => void;
  showGrid: boolean;
  gridDivisions: number;
};

function computeCanvasSize(w: number, h: number) {
  if (w >= h) return { canvasW: PREVIEW_MAX, canvasH: Math.round((PREVIEW_MAX * h) / w) };
  return { canvasW: Math.round((PREVIEW_MAX * w) / h), canvasH: PREVIEW_MAX };
}

// Renderiza o texto DE VERDADE (não uma estimativa de caixa como o app
// original, _element_screen_box em layout_editor.py:292-307) — o que
// aparece no editor é pixel-a-pixel o que sai na imagem final.
function renderTextPreview(c: TextElementConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(c.maxW));
  canvas.height = Math.max(1, Math.ceil(c.maxLines * c.fontSize * 1.6));
  const ctx = canvas.getContext("2d")!;
  drawTextFit(ctx, c.text || " ", c.fontWeight, c.fontSize, c.maxW, 0, 0, c.color, c.align, c.maxLines);
  return canvas;
}

type NodeProps = {
  scale: number;
  selected: boolean;
  onSelect: () => void;
  registerRef: (key: ElementKey, node: Konva.Node | null) => void;
};

function ImageBoxNode({
  nodeKey,
  cfg,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
}: NodeProps & { nodeKey: ElementKey; cfg: ImageElementConfig; onUpdate: (patch: Partial<ImageElementConfig>) => void }) {
  return (
    <Rect
      ref={(node) => registerRef(nodeKey, node)}
      x={cfg.x * scale}
      y={cfg.y * scale}
      width={cfg.w * scale}
      height={cfg.h * scale}
      stroke="#4fc3f7"
      strokeWidth={selected ? 3 : 2}
      dash={[6, 4]}
      fill="rgba(79,195,247,0.08)"
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => onUpdate({ x: Math.round(e.target.x() / scale), y: Math.round(e.target.y() / scale) })}
      onDragEnd={(e) => onUpdate({ x: Math.round(e.target.x() / scale), y: Math.round(e.target.y() / scale) })}
      onTransform={(e) => {
        const node = e.target;
        const newW = Math.max(MIN_BOX, Math.round((node.width() * node.scaleX()) / scale));
        const newH = Math.max(MIN_BOX, Math.round((node.height() * node.scaleY()) / scale));
        node.scaleX(1);
        node.scaleY(1);
        node.width(newW * scale);
        node.height(newH * scale);
        onUpdate({ w: newW, h: newH, x: Math.round(node.x() / scale), y: Math.round(node.y() / scale) });
      }}
    />
  );
}

function TextElementNode({
  nodeKey,
  cfg,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
}: NodeProps & { nodeKey: ElementKey; cfg: TextElementConfig; onUpdate: (patch: Partial<TextElementConfig>) => void }) {
  // Memoiza por campo primitivo de propósito (cfg muda de identidade a
  // cada digitação em qualquer elemento; usar o objeto inteiro faria
  // recalcular o preview de todo texto a cada tecla).
  const previewCanvas = useMemo(
    () => renderTextPreview(cfg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.text, cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.fontWeight]
  );

  return (
    <KonvaImage
      ref={(node) => registerRef(nodeKey, node)}
      image={previewCanvas}
      x={cfg.x * scale}
      y={cfg.y * scale}
      width={cfg.maxW * scale}
      height={previewCanvas.height * scale}
      stroke={selected ? "#4fc3f7" : undefined}
      strokeWidth={selected ? 2 : 0}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => onUpdate({ x: Math.round(e.target.x() / scale), y: Math.round(e.target.y() / scale) })}
      onDragEnd={(e) => onUpdate({ x: Math.round(e.target.x() / scale), y: Math.round(e.target.y() / scale) })}
      onTransform={(e) => {
        const node = e.target;
        const newMaxW = Math.max(MIN_MAX_W, Math.round((node.width() * node.scaleX()) / scale));
        node.scaleX(1);
        node.scaleY(1);
        onUpdate({ maxW: newMaxW, x: Math.round(node.x() / scale) });
      }}
    />
  );
}

export default function LayoutEditorCanvas({
  layoutImg,
  config,
  onConfigChange,
  selectedKey,
  onSelect,
  showGrid,
  gridDivisions,
}: Props) {
  const { canvasW, canvasH } = computeCanvasSize(layoutImg.naturalWidth, layoutImg.naturalHeight);
  const scale = canvasW / layoutImg.naturalWidth;

  const nodeRefs = useRef<Partial<Record<ElementKey, Konva.Node>>>({});
  const transformerRef = useRef<Konva.Transformer>(null);

  function registerRef(key: ElementKey, node: Konva.Node | null) {
    if (node) nodeRefs.current[key] = node;
  }

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const node = selectedKey ? nodeRefs.current[selectedKey] : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  });

  function updateElement<K extends ElementKey>(key: K, patch: Partial<ImageElementConfig & TextElementConfig>) {
    onConfigChange((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const n = Math.max(2, gridDivisions);
    const lines: { points: number[]; center: boolean }[] = [];
    for (let i = 1; i < n; i++) {
      const x = Math.round((i * canvasW) / n);
      lines.push({ points: [x, 0, x, canvasH], center: Math.abs(x - canvasW / 2) < 1 });
    }
    for (let i = 1; i < n; i++) {
      const y = Math.round((i * canvasH) / n);
      lines.push({ points: [0, y, canvasW, y], center: Math.abs(y - canvasH / 2) < 1 });
    }
    return lines;
  }, [showGrid, gridDivisions, canvasW, canvasH]);

  const selectedDef = selectedKey ? ELEMENT_DEFS.find((d) => d.key === selectedKey) : null;
  const selectedIsImage = selectedDef?.type === "image";

  return (
    <Stage
      width={canvasW}
      height={canvasH}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
      onTap={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
    >
      <Layer>
        <KonvaImage image={layoutImg} width={canvasW} height={canvasH} listening={false} />

        {gridLines.map((l, i) => (
          <Line
            key={i}
            points={l.points}
            stroke={l.center ? "#4fc3f7" : "#ffffff"}
            strokeWidth={l.center ? 1.4 : 1}
            opacity={l.center ? 0.8 : 0.35}
            listening={false}
          />
        ))}

        {ELEMENT_DEFS.map((def) =>
          def.type === "image" ? (
            <ImageBoxNode
              key={def.key}
              nodeKey={def.key}
              cfg={config[def.key] as ImageElementConfig}
              scale={scale}
              selected={selectedKey === def.key}
              onSelect={() => onSelect(def.key)}
              onUpdate={(patch) => updateElement(def.key, patch)}
              registerRef={registerRef}
            />
          ) : (
            <TextElementNode
              key={def.key}
              nodeKey={def.key}
              cfg={config[def.key] as TextElementConfig}
              scale={scale}
              selected={selectedKey === def.key}
              onSelect={() => onSelect(def.key)}
              onUpdate={(patch) => updateElement(def.key, patch)}
              registerRef={registerRef}
            />
          )
        )}

        <Transformer
          ref={transformerRef}
          enabledAnchors={selectedIsImage ? ["top-left", "top-right", "bottom-left", "bottom-right"] : ["middle-left", "middle-right"]}
          rotateEnabled={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < MIN_BOX || Math.abs(newBox.height) < MIN_BOX) return oldBox;
            return newBox;
          }}
        />
      </Layer>
    </Stage>
  );
}
