"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Group, Shape as KonvaShape, Transformer } from "react-konva";
import type Konva from "konva";
import {
  CARD_FIELD_DEFS,
  DEFAULT_FONT_FAMILY,
  fontPairsFromCardLayout,
  substitutePlaceholders,
  type CardElementConfig,
  type CardFieldKey,
  type CardImageElementConfig,
  type CardLayout,
  type CardShape,
  type CardTextElementConfig,
} from "../../../core/cardConfig";
import { drawTextFit } from "@/lib/canvasText";
import { ensureFontsLoaded } from "@/lib/fonts/fontLoader";

const PREVIEW_MAX = 420;
const MIN_BOUNDARY = 60;
const MIN_FIELD_SIZE = 20;
const GHOST_GAP = 24;
const ORIGIN = 24;

function computeScale(largura: number, alturaMinima: number) {
  const maior = Math.max(largura, alturaMinima);
  const scale = maior > PREVIEW_MAX ? PREVIEW_MAX / maior : 1;
  return { scale, canvasW: Math.round(largura * scale), canvasH: Math.round(alturaMinima * scale) };
}

// Mesma técnica de prévia WYSIWYG do Editor de Layout do Gerador de
// Ofertas (renderTextPreview em ofertas/layout-editor/LayoutEditorCanvas.tsx)
// — renderiza o texto DE VERDADE via drawTextFit num canvas offscreen,
// convertido pra Konva.Image. Sem produtos reais ainda, usa o texto de
// exemplo do campo (CARD_FIELD_DEFS[].sampleText). Fonte real da
// biblioteca (Fase 5, Parte 11) — cai pro padrão em card-molde salvo
// antes dessa parte, que não tem `fontFamily` gravado.
function renderTextPreview(cfg: CardTextElementConfig, sampleText: string): HTMLCanvasElement {
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

// Modo de seleção de um clique: simples = substitui a seleção inteira;
// Ctrl/Cmd+clique = adiciona à seleção; Alt+clique = retira da seleção
// (sem afetar o resto). Mesma convenção usada em editores gráficos
// (Figma/Canva). Toque (onTap) não tem noção de modificador — cai
// sempre em "replace".
type SelectMode = "replace" | "add" | "remove";

function getSelectMode(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): SelectMode {
  const evt = e.evt as MouseEvent;
  if (evt.altKey) return "remove";
  if (evt.ctrlKey || evt.metaKey) return "add";
  return "replace";
}

type NodeProps = {
  scale: number;
  selected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  registerRef: (key: string, node: Konva.Node | null) => void;
};

function ImageFieldNode({
  fieldKey,
  cfg,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
}: NodeProps & {
  fieldKey: CardFieldKey;
  cfg: CardImageElementConfig;
  onUpdate: (patch: Partial<CardImageElementConfig>) => void;
}) {
  return (
    <Rect
      ref={(node) => registerRef(fieldKey, node)}
      x={ORIGIN + cfg.x * scale}
      y={ORIGIN + cfg.y * scale}
      width={cfg.w * scale}
      height={cfg.h * scale}
      stroke="#4fc3f7"
      strokeWidth={selected ? 3 : 2}
      dash={[6, 4]}
      fill="rgba(79,195,247,0.08)"
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
        const newW = Math.max(MIN_FIELD_SIZE, Math.round((node.width() * node.scaleX()) / scale));
        const newH = Math.max(MIN_FIELD_SIZE, Math.round((node.height() * node.scaleY()) / scale));
        node.scaleX(1);
        node.scaleY(1);
        node.width(newW * scale);
        node.height(newH * scale);
        onUpdate({ w: newW, h: newH, x: Math.round((node.x() - ORIGIN) / scale), y: Math.round((node.y() - ORIGIN) / scale) });
      }}
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
  fontsTick,
}: NodeProps & {
  fieldKey: CardFieldKey;
  cfg: CardTextElementConfig;
  sampleText: string;
  onUpdate: (patch: Partial<CardTextElementConfig>) => void;
  fontsTick: number;
}) {
  // Memoiza por campo primitivo de propósito (cfg muda de identidade a
  // cada digitação); fontsTick força recalcular quando uma fonte
  // termina de carregar depois do primeiro desenho (ver ensureFontsLoaded
  // no componente principal) — sem isso a prévia ficaria presa na fonte
  // de fallback até o usuário mexer em outro campo.
  const previewCanvas = useMemo(
    () => renderTextPreview(cfg, substitutePlaceholders(cfg.text ?? "{valor}", sampleText)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.text, cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.fontWeight, cfg.fontFamily, sampleText, fontsTick]
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

// Forma decorativa (retângulo/elipse/triângulo) — sem vínculo com dado
// de produto, lista livre (não é um CardFieldKey). Mesma mecânica de
// arraste/redimensionamento dos outros elementos (origem no canto
// superior-esquerdo, width/height). Retângulo usa o <Rect> nativo do
// Konva; elipse/triângulo usam <Shape> com sceneFunc custom (desenha
// via Canvas 2D direto) — assim os três continuam com x()/y()/width()/
// height() padrão, compatíveis com o mesmo código de drag/Transformer,
// sem precisar de matemática de origem centralizada (caso do
// Konva.Ellipse nativo, que usa centro em vez de canto).
function ShapeNode({
  shape,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
}: {
  shape: CardShape;
  scale: number;
  selected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onUpdate: (patch: Partial<CardShape>) => void;
  registerRef: (key: string, node: Konva.Node | null) => void;
}) {
  const x = ORIGIN + shape.x * scale;
  const y = ORIGIN + shape.y * scale;
  const width = shape.w * scale;
  const height = shape.h * scale;

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

  const common = {
    x,
    y,
    width,
    height,
    fill: shape.color,
    opacity: shape.opacity,
    stroke: selected ? "#4fc3f7" : undefined,
    strokeWidth: selected ? 2 : 0,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragMove: handleDrag,
    onDragEnd: handleDrag,
    onTransform: handleTransform,
  };

  if (shape.type === "retangulo") {
    return <Rect ref={(node) => registerRef(shape.id, node)} {...common} />;
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

  return <KonvaShape ref={(node) => registerRef(shape.id, node)} {...common} sceneFunc={sceneFunc} />;
}

// Boundary = largura/altura mínima do card (spec seção 3.1). Fica
// sempre na origem (0,0) do "espaço do card" — posição absoluta na
// página só importa na Parte 3 (editor de página) — e só é
// redimensionável (Transformer próprio, 4 cantos + 4 pontos médios),
// nunca arrastável. Redimensionar NÃO re-escala os campos dentro dele
// (mesma decisão já usada no product_box do Editor de Layout do
// Ofertas). `keepRatio` (default do Konva, true) só afeta os cantos —
// mantêm largura×altura proporcionais; os pontos médios já
// redimensionam um eixo só por conta própria, com ou sem keepRatio.
// NUNCA desligar via `keepRatio={false}`: isso também destrava os
// CANTOS, que devem continuar proporcionais (bug já cometido aqui,
// corrigido — ver mesmo comentário em paginas/[tipo]/PageEditorCanvas.tsx).
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
  onResize: (patch: { largura: number; alturaMinima: number }) => void;
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
          onResize({ largura: newLargura, alturaMinima: newAltura });
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

// Cópia fantasma pro modo de captura de gutter (spec seção 2.1, passo
// 3): só arrastável como um grupo rígido, sem seleção/edição
// individual de campo — o usuário posiciona ao lado do card original
// e o delta X/Y vira gutter_x/gutter_y.
function GhostCard({
  layout,
  camposHabilitados,
  scale,
  canvasW,
  canvasH,
  x,
  y,
  onDragEnd,
}: {
  layout: CardLayout;
  camposHabilitados: CardFieldKey[];
  scale: number;
  canvasW: number;
  canvasH: number;
  x: number;
  y: number;
  onDragEnd: (pos: { x: number; y: number }) => void;
}) {
  return (
    <Group x={x} y={y} draggable opacity={0.55} onDragEnd={(e) => onDragEnd({ x: e.target.x(), y: e.target.y() })}>
      {/* Fundo cobrindo o card inteiro — sem isso, os campos internos
          (todos listening=false, de propósito, pra não permitir seleção
          individual) deixavam a maior parte da área do card sem nenhuma
          forma "clicável", e o grupo não recebia o gesto de arrastar. */}
      <Rect
        x={0}
        y={0}
        width={canvasW}
        height={canvasH}
        fill="rgba(15,23,42,0.04)"
        stroke="#64748b"
        strokeWidth={1.5}
        dash={[4, 4]}
      />
      {CARD_FIELD_DEFS.filter((d) => camposHabilitados.includes(d.key)).map((def) => {
        const cfg = layout[def.key];
        if (def.type === "image") {
          const ic = cfg as CardImageElementConfig;
          return (
            <Rect
              key={def.key}
              x={ic.x * scale}
              y={ic.y * scale}
              width={ic.w * scale}
              height={ic.h * scale}
              stroke="#94a3b8"
              dash={[6, 4]}
              fill="rgba(148,163,184,0.15)"
              listening={false}
            />
          );
        }
        const tc = cfg as CardTextElementConfig;
        const preview = renderTextPreview(tc, substitutePlaceholders(tc.text ?? "{valor}", def.sampleText ?? ""));
        return (
          <KonvaImage
            key={def.key}
            image={preview}
            x={tc.x * scale}
            y={tc.y * scale}
            width={tc.maxW * scale}
            height={preview.height * scale}
            listening={false}
          />
        );
      })}
    </Group>
  );
}

export type CardEditorCanvasProps = {
  layout: CardLayout;
  onLayoutChange: (updater: (prev: CardLayout) => CardLayout) => void;
  camposHabilitados: CardFieldKey[];
  shapes: CardShape[];
  onShapesChange: (updater: (prev: CardShape[]) => CardShape[]) => void;
  largura: number;
  alturaMinima: number;
  onResizeBoundary: (patch: { largura: number; alturaMinima: number }) => void;
  // Seleção múltipla: array em vez de valor único — Ctrl+clique
  // adiciona um campo/forma à seleção, Alt+clique retira, clique
  // simples substitui tudo por só o item clicado (ver `SelectMode`).
  selectedKeys: CardFieldKey[];
  onSelectField: (key: CardFieldKey, mode: SelectMode) => void;
  selectedShapeIds: string[];
  onSelectShape: (id: string, mode: SelectMode) => void;
  onClearSelection: () => void;
  gutterMode: boolean;
  gutterX: number | null;
  gutterY: number | null;
  onGutterChange: (patch: { gutterX: number; gutterY: number }) => void;
};

export default function CardEditorCanvas({
  layout,
  onLayoutChange,
  camposHabilitados,
  shapes,
  onShapesChange,
  largura,
  alturaMinima,
  onResizeBoundary,
  selectedKeys,
  onSelectField,
  selectedShapeIds,
  onSelectShape,
  onClearSelection,
  gutterMode,
  gutterX,
  gutterY,
  onGutterChange,
}: CardEditorCanvasProps) {
  const { scale, canvasW, canvasH } = computeScale(largura, alturaMinima);

  const nodeRefs = useRef<Partial<Record<string, Konva.Node>>>({});
  const fieldTransformerRef = useRef<Konva.Transformer>(null);
  const boundaryTransformerRef = useRef<Konva.Transformer>(null);
  const [fontsTick, setFontsTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    ensureFontsLoaded(fontPairsFromCardLayout(layout)).then(() => {
      if (!cancelled) setFontsTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [layout]);

  function registerRef(key: string, node: Konva.Node | null) {
    if (node) nodeRefs.current[key] = node;
  }

  useEffect(() => {
    const tr = fieldTransformerRef.current;
    if (!tr) return;
    const nodes = [...selectedKeys, ...selectedShapeIds]
      .map((key) => nodeRefs.current[key])
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  });

  function updateField<K extends CardFieldKey>(key: K, patch: CardElementConfig) {
    onLayoutChange((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function updateShape(id: string, patch: Partial<CardShape>) {
    onShapesChange((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function selectField(key: CardFieldKey, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    onSelectField(key, getSelectMode(e));
  }

  function selectShape(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    onSelectShape(id, getSelectMode(e));
  }

  // Posição da cópia fantasma é derivada direto de gutterX/gutterY (sem
  // estado local próprio) — arrastar chama onGutterChange, que atualiza
  // o estado no componente pai e recalcula isso no próximo render.
  const ghostDefaultX = ORIGIN + canvasW + GHOST_GAP;
  const ghostPos = {
    x: gutterX !== null ? ORIGIN + gutterX * scale : ghostDefaultX,
    y: gutterY !== null ? ORIGIN + gutterY * scale : ORIGIN,
  };

  const selectionCount = selectedKeys.length + selectedShapeIds.length;
  const selectedDef = selectedKeys.length === 1 ? CARD_FIELD_DEFS.find((d) => d.key === selectedKeys[0]) : null;
  // Forma selecionada usa o mesmo conjunto de âncoras livres (8 pontos)
  // já usado pro campo de imagem — redimensiona livre em qualquer eixo.
  const isFreeResize = selectedShapeIds.length === 1 || selectedDef?.type === "image";
  // Com mais de um elemento selecionado, o Transformer só mostra o
  // contorno da seleção (sem alças de redimensionar) — redimensionar
  // vários elementos de tipos/tamanhos diferentes ao mesmo tempo não foi
  // pedido e produziria distorção imprevisível; mover com as setas do
  // teclado (ver page.tsx) continua funcionando pra qualquer nº de itens.
  const enabledAnchors =
    selectionCount > 1
      ? []
      : isFreeResize
        ? (["top-left", "top-right", "bottom-left", "bottom-right", "top-center", "bottom-center", "middle-left", "middle-right"] as const)
        : (["middle-left", "middle-right"] as const);
  const stageW = gutterMode ? ghostDefaultX + canvasW + ORIGIN : canvasW + ORIGIN * 2;
  const stageH = canvasH + ORIGIN * 2;

  return (
    <Stage
      width={stageW}
      height={stageH}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onClearSelection();
      }}
      onTap={(e) => {
        if (e.target === e.target.getStage()) onClearSelection();
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

        {shapes.map((shape) => (
          <ShapeNode
            key={shape.id}
            shape={shape}
            scale={scale}
            selected={selectedShapeIds.includes(shape.id)}
            onSelect={(e) => selectShape(shape.id, e)}
            onUpdate={(patch) => updateShape(shape.id, patch)}
            registerRef={registerRef}
          />
        ))}

        {CARD_FIELD_DEFS.filter((d) => camposHabilitados.includes(d.key)).map((def) =>
          def.type === "image" ? (
            <ImageFieldNode
              key={def.key}
              fieldKey={def.key}
              cfg={layout[def.key] as CardImageElementConfig}
              scale={scale}
              selected={selectedKeys.includes(def.key)}
              onSelect={(e) => selectField(def.key, e)}
              onUpdate={(patch) => updateField(def.key, patch)}
              registerRef={registerRef}
            />
          ) : (
            <TextFieldNode
              key={def.key}
              fieldKey={def.key}
              cfg={layout[def.key] as CardTextElementConfig}
              sampleText={def.sampleText ?? ""}
              scale={scale}
              selected={selectedKeys.includes(def.key)}
              onSelect={(e) => selectField(def.key, e)}
              onUpdate={(patch) => updateField(def.key, patch)}
              registerRef={registerRef}
              fontsTick={fontsTick}
            />
          )
        )}

        <Transformer
          ref={fieldTransformerRef}
          enabledAnchors={[...enabledAnchors]}
          rotateEnabled={false}
          keepRatio={true}
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < MIN_FIELD_SIZE || Math.abs(newBox.height) < MIN_FIELD_SIZE) return oldBox;
            return newBox;
          }}
        />

        {gutterMode && (
          <GhostCard
            layout={layout}
            camposHabilitados={camposHabilitados}
            scale={scale}
            canvasW={canvasW}
            canvasH={canvasH}
            x={ghostPos.x}
            y={ghostPos.y}
            onDragEnd={(pos) =>
              onGutterChange({
                gutterX: Math.round((pos.x - ORIGIN) / scale),
                gutterY: Math.round((pos.y - ORIGIN) / scale),
              })
            }
          />
        )}
      </Layer>
    </Stage>
  );
}
