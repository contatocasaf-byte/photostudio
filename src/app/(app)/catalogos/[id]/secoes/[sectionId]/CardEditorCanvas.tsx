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
  type CardBorda,
  type CardImageElementConfig,
  type CardLayout,
  type CardShape,
  type CardTextElementConfig,
} from "../../../core/cardConfig";
import { corComOpacidade } from "../../../core/cor";
import { alturaAutomaticaTexto, alturaCaixaTexto, chaveTexto, expandirPorGrupo, listarTextosVisiveis } from "../../../core/cardElementos";
import { raioEfetivoRetangulo, tracarTriangulo } from "../../../core/formaArredondada";
import { drawTextFit } from "@/lib/canvasText";
import { desenharPrecoDestacado } from "@/lib/precoDestacado";
import { ensureFontsLoaded } from "@/lib/fonts/fontLoader";

const PREVIEW_MAX = 420;
const MIN_BOUNDARY = 60;
const MIN_FIELD_SIZE = 20;
// Quanto o card pode ser empurrado pra fora (esquerda/cima) do ponto de origem do
// palco sem sair da área visível — passou disso, o palco "abre espaço" e o conjunto desloca.
const MIN_ORIGEM_FOLGA = 8;
const GHOST_GAP = 24;
const ORIGIN = 56;
const MIN_ORIGEM = -(ORIGIN - MIN_ORIGEM_FOLGA);

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
  // Nunca menor que o espaço natural do texto; a caixa (cfg.h) só recorta a
  // parte mostrada no editor (ver `crop` em TextFieldNode).
  canvas.height = Math.max(alturaAutomaticaTexto(cfg), alturaCaixaTexto(cfg));
  const ctx = canvas.getContext("2d")!;
  if (
    cfg.precoEstilo === "destacado" &&
    desenharPrecoDestacado(ctx, sampleText, cfg.fontFamily ?? DEFAULT_FONT_FAMILY, cfg.fontWeight, cfg.fontSize, cfg.maxW, 0, 0, cfg.color, cfg.align)
  ) {
    return canvas;
  }
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
  // Chamado ao começar a arrastar — o canvas usa pra passar o arraste ao
  // elemento MENOR sob o ponteiro quando há sobreposição (ver alvoSobPonteiro).
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
};

function ImageFieldNode({
  fieldKey,
  cfg,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
  onDragStart,
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
      fill={cfg.fundo?.ativo ? corComOpacidade(cfg.fundo.cor, cfg.fundo.opacidade) : "rgba(79,195,247,0.08)"}
      cornerRadius={raioEfetivoRetangulo(cfg.w * scale, cfg.h * scale, (cfg.raio ?? 0) * scale)}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onDragStart}
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
  onDragStart,
  fontsTick,
}: NodeProps & {
  // Chave de campo fixo OU id de um texto livre (os dois usam este nó).
  fieldKey: string;
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
    [cfg.text, cfg.fontSize, cfg.maxW, cfg.color, cfg.align, cfg.maxLines, cfg.h, cfg.fontWeight, cfg.fontFamily, cfg.precoEstilo, sampleText, fontsTick]
  );
  const alturaCaixa = alturaCaixaTexto(cfg);

  return (
    <KonvaImage
      ref={(node) => registerRef(fieldKey, node)}
      image={previewCanvas}
      // Só recorta quando a caixa foi ajustada à mão (`h`); sem isso, igual a antes.
      crop={cfg.h ? { x: 0, y: 0, width: previewCanvas.width, height: alturaCaixa } : undefined}
      x={ORIGIN + cfg.x * scale}
      y={ORIGIN + cfg.y * scale}
      width={cfg.maxW * scale}
      height={alturaCaixa * scale}
      stroke={selected ? "#4fc3f7" : undefined}
      strokeWidth={selected ? 2 : 0}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onDragStart}
      onDragMove={(e) =>
        onUpdate({ x: Math.round((e.target.x() - ORIGIN) / scale), y: Math.round((e.target.y() - ORIGIN) / scale) })
      }
      onDragEnd={(e) =>
        onUpdate({ x: Math.round((e.target.x() - ORIGIN) / scale), y: Math.round((e.target.y() - ORIGIN) / scale) })
      }
      onTransform={(e) => {
        const node = e.target;
        const newMaxW = Math.max(MIN_FIELD_SIZE, Math.round((node.width() * node.scaleX()) / scale));
        // Só mexe na altura se a alça de cima/baixo foi usada (escala Y mudou);
        // arrastar só as laterais não "fixa" a altura automática.
        const mudouAltura = Math.abs(node.scaleY() - 1) > 0.001;
        const newH = Math.max(MIN_FIELD_SIZE, Math.round((node.height() * node.scaleY()) / scale));
        node.scaleX(1);
        node.scaleY(1);
        if (mudouAltura) node.height(newH * scale);
        onUpdate({
          maxW: newMaxW,
          x: Math.round((node.x() - ORIGIN) / scale),
          ...(mudouAltura ? { h: newH, y: Math.round((node.y() - ORIGIN) / scale) } : {}),
        });
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
  onDragStart,
}: {
  shape: CardShape;
  scale: number;
  selected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onUpdate: (patch: Partial<CardShape>) => void;
  registerRef: (key: string, node: Konva.Node | null) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
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
    onDragStart,
    onDragMove: handleDrag,
    onDragEnd: handleDrag,
    onTransform: handleTransform,
  };

  const raioPx = (shape.raio ?? 0) * scale;

  if (shape.type === "retangulo") {
    return <Rect ref={(node) => registerRef(shape.id, node)} {...common} cornerRadius={raioEfetivoRetangulo(width, height, raioPx)} />;
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
          ctx.beginPath();
          tracarTriangulo(ctx, node.width(), node.height(), raioPx);
          ctx.fillStrokeShape(node);
        };

  return <KonvaShape ref={(node) => registerRef(shape.id, node)} {...common} sceneFunc={sceneFunc} />;
}

// Boundary = largura/altura mínima do card (spec seção 3.1). Só é
// redimensionável (Transformer próprio, 4 cantos + 4 pontos médios), nunca
// arrastável, e as alças só aparecem quando o CARD está selecionado (nenhum
// campo/forma selecionado) — antes ficavam sempre visíveis e davam a
// impressão de que o card estava selecionado junto com o campo.
//
// Redimensionar NÃO re-escala os campos dentro dele (mesma decisão do
// product_box do Editor de Layout do Ofertas) e NÃO os move na tela: arrastar
// a borda de CIMA ou da ESQUERDA move aquela borda (a oposta fica parada) e os
// campos ficam onde estão. Como as coordenadas dos campos são relativas ao
// canto superior-esquerdo do card, ao soltar o deslocamento da borda vira um
// ajuste de -dx/-dy em todos os campos e formas (onCommit) e o card volta à
// origem do canvas. Durante o arraste a escala fica congelada (onStart/onCommit),
// senão ela mudaria a cada tick em cards grandes.
//
// `keepRatio` (default do Konva, true) só afeta os cantos — mantêm
// largura×altura proporcionais; os pontos médios já redimensionam um eixo só
// por conta própria. NUNCA desligar via `keepRatio={false}`: isso também
// destrava os CANTOS, que devem continuar proporcionais.
function BoundaryRect({
  canvasW,
  canvasH,
  scale,
  onResize,
  onStart,
  onCommit,
  transformerRef,
  borda,
  ativo,
  onClear,
}: {
  canvasW: number;
  canvasH: number;
  scale: number;
  onResize: (patch: { largura: number; alturaMinima: number }) => void;
  onStart: () => void;
  onCommit: (deslocamento: { dx: number; dy: number }) => void;
  transformerRef: RefObject<Konva.Transformer | null>;
  borda: CardBorda;
  ativo: boolean;
  onClear: () => void;
}) {
  // Cantos arredondados e fundo do CARD (ver CardBorda): o fundo vai numa
  // camada própria sob o retângulo clicável, que fica só com o contorno
  // tracejado — clicar nele limpa a seleção (mostra a "Estrutura do card").
  const raio = raioEfetivoRetangulo(canvasW, canvasH, (borda.raio ?? 0) * scale);
  const rectRef = useRef<Konva.Rect>(null);
  // Posição do card durante o arraste de uma borda de cima/esquerda (a base e o
  // fundo acompanham o retângulo arrastado).
  const [pos, setPos] = useState({ x: ORIGIN, y: ORIGIN });

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr || !rectRef.current) return;
    tr.nodes(ativo ? [rectRef.current] : []);
    tr.getLayer()?.batchDraw();
  }, [transformerRef, ativo]);

  return (
    <>
      <Rect x={pos.x} y={pos.y} width={canvasW} height={canvasH} fill="#ffffff" cornerRadius={raio} listening={false} />
      {borda.fundo?.ativo && (
        <Rect
          x={pos.x}
          y={pos.y}
          width={canvasW}
          height={canvasH}
          fill={corComOpacidade(borda.fundo.cor, borda.fundo.opacidade)}
          cornerRadius={raio}
          listening={false}
        />
      )}
      <Rect
        ref={rectRef}
        x={pos.x}
        y={pos.y}
        width={canvasW}
        height={canvasH}
        fill="transparent"
        cornerRadius={raio}
        stroke={ativo ? "#94a3b8" : "#cbd5e1"}
        strokeWidth={ativo ? 1.5 : 1}
        dash={[4, 4]}
        onMouseDown={onClear}
        onTap={onClear}
        onTransformStart={onStart}
        onTransform={(e) => {
          const node = e.target;
          const newLargura = Math.max(MIN_BOUNDARY, Math.round((node.width() * node.scaleX()) / scale));
          const newAltura = Math.max(MIN_BOUNDARY, Math.round((node.height() * node.scaleY()) / scale));
          node.scaleX(1);
          node.scaleY(1);
          node.width(newLargura * scale);
          node.height(newAltura * scale);
          // x/y NÃO são forçados de volta: o Konva já os ajusta pra manter a
          // borda oposta parada (forçar a origem a cada tick era o que fazia a
          // borda errada se mover e o card se distorcer).
          setPos({ x: node.x(), y: node.y() });
          onResize({ largura: newLargura, alturaMinima: newAltura });
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const dx = Math.round((node.x() - ORIGIN) / scale);
          const dy = Math.round((node.y() - ORIGIN) / scale);
          node.x(ORIGIN);
          node.y(ORIGIN);
          setPos({ x: ORIGIN, y: ORIGIN });
          onCommit({ dx, dy });
        }}
      />
    </>
  );
}

// Alças do card — desenhadas DEPOIS dos campos e formas (no topo da pilha). Se
// ficassem junto do retângulo do card (por baixo), um campo ou forma por cima
// da alça roubava o clique e o arraste movia o campo em vez de redimensionar o
// card.
function BoundaryTransformer({
  transformerRef,
  scale,
  soAltura,
}: {
  transformerRef: RefObject<Konva.Transformer | null>;
  scale: number;
  soAltura: boolean;
}) {
  return (
    <Transformer
      ref={transformerRef}
      // Largura travada (card de destaque = largura da grade): só dá pra
      // mexer na altura.
      enabledAnchors={
        soAltura
          ? ["top-center", "bottom-center"]
          : [
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
              "top-center",
              "bottom-center",
              "middle-left",
              "middle-right",
            ]
      }
      rotateEnabled={false}
      flipEnabled={false}
      ignoreStroke={true}
      keepRatio={true}
      boundBoxFunc={(oldBox, newBox) => {
        if (Math.abs(newBox.width) < MIN_BOUNDARY * scale || Math.abs(newBox.height) < MIN_BOUNDARY * scale) return oldBox;
        return newBox;
      }}
    />
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
  // Soltou uma borda de cima/esquerda do card: o conteúdo (campos e formas)
  // deve andar -dx/-dy pra continuar no mesmo lugar da tela.
  onShiftContent: (dx: number, dy: number) => void;
  // Seleção múltipla: array em vez de valor único — Ctrl+clique
  // adiciona um campo/forma à seleção, Alt+clique retira, clique
  // simples substitui tudo por só o item clicado (ver `SelectMode`).
  selectedKeys: CardFieldKey[];
  onSelectField: (key: CardFieldKey, mode: SelectMode) => void;
  selectedShapeIds: string[];
  onSelectShape: (id: string, mode: SelectMode) => void;
  onClearSelection: () => void;
  // Fundo e cantos arredondados do card (CardBorda).
  borda: CardBorda;
  // Largura travada (card de destaque): só as alças de altura do card.
  larguraTravada?: boolean;
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
  onShiftContent,
  selectedKeys,
  onSelectField,
  selectedShapeIds,
  onSelectShape,
  onClearSelection,
  borda,
  larguraTravada = false,
  gutterMode,
  gutterX,
  gutterY,
  onGutterChange,
}: CardEditorCanvasProps) {
  // Escala congelada enquanto uma borda do card é arrastada (ver BoundaryRect).
  const [escalaFixa, setEscalaFixa] = useState<number | null>(null);
  // Deslocamento do card no palco (px de tela) depois de arrastar a borda de
  // cima/esquerda PRA DENTRO: o card fica onde foi solto (a borda oposta e os
  // campos não se mexem na tela). Para fora também, até a folga da margem do
  // palco (MIN_ORIGEM); passou disso, o conjunto desloca — não dá pra desenhar
  // em coordenada negativa.
  const [origem, setOrigem] = useState({ x: 0, y: 0 });
  const base = computeScale(largura, alturaMinima);
  const scale = escalaFixa ?? base.scale;
  const canvasW = escalaFixa !== null ? Math.round(largura * scale) : base.canvasW;
  const canvasH = escalaFixa !== null ? Math.round(alturaMinima * scale) : base.canvasH;

  const nodeRefs = useRef<Partial<Record<string, Konva.Node>>>({});
  // Onde o botão do mouse (ou o dedo) foi pressionado por último, no palco.
  const pressionadoEm = useRef<{ x: number; y: number } | null>(null);
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

  // Texto livre (layout["texto:<id>"]) — atualiza só ele.
  function updateTexto(id: string, patch: CardElementConfig) {
    const chave = chaveTexto(id);
    onLayoutChange((prev) => (prev[chave] ? { ...prev, [chave]: { ...prev[chave], ...patch } } : prev));
  }

  const ehCampoFixo = (chave: string) => CARD_FIELD_DEFS.some((d) => d.key === chave);

  // --- Movimento em conjunto (grupos e seleção múltipla) -------------------
  // Ao começar a arrastar um elemento, guarda a posição de todos os que devem
  // andar junto (a seleção atual, ou o grupo dele se ainda não estava
  // selecionado); enquanto arrasta, os outros recebem o mesmo deslocamento.
  const arrasteRef = useRef<{ dono: string; inicio: Record<string, { x: number; y: number }> } | null>(null);

  function posicaoDe(chave: string): { x: number; y: number } | null {
    const forma = shapes.find((s) => s.id === chave);
    if (forma) return { x: forma.x, y: forma.y };
    const cfg = (ehCampoFixo(chave) ? layout[chave] : layout[chaveTexto(chave)]) as { x?: number; y?: number } | undefined;
    return cfg && cfg.x !== undefined && cfg.y !== undefined ? { x: cfg.x, y: cfg.y } : null;
  }

  function aplicarPosicao(chave: string, x: number, y: number) {
    if (shapes.some((s) => s.id === chave)) updateShape(chave, { x, y });
    else if (ehCampoFixo(chave)) updateField(chave as CardFieldKey, { x, y });
    else updateTexto(chave, { x, y });
  }

  function iniciarArraste(chave: string) {
    const selecionados = [...selectedKeys, ...selectedShapeIds];
    const base = selecionados.includes(chave) ? selecionados : [chave];
    const exp = expandirPorGrupo(
      { layout, shapes },
      { campos: base.filter(ehCampoFixo), livres: base.filter((k) => !ehCampoFixo(k)) },
      camposHabilitados
    );
    const inicio: Record<string, { x: number; y: number }> = {};
    for (const k of [...exp.campos, ...exp.livres, chave]) {
      const p = posicaoDe(k);
      if (p) inicio[k] = p;
    }
    arrasteRef.current = { dono: chave, inicio };
    const limpar = () => {
      arrasteRef.current = null;
    };
    window.addEventListener("mouseup", limpar, { once: true });
    window.addEventListener("touchend", limpar, { once: true });
  }

  // Chamado a cada movimento do elemento que está sendo arrastado.
  function moverJuntos(dono: string, x: number, y: number) {
    const a = arrasteRef.current;
    if (!a || a.dono !== dono || !a.inicio[dono]) return;
    const dx = x - a.inicio[dono].x;
    const dy = y - a.inicio[dono].y;
    for (const [k, p] of Object.entries(a.inicio)) {
      if (k === dono) continue;
      aplicarPosicao(k, p.x + dx, p.y + dy);
    }
  }

  // onUpdate de um nó arrastável: atualiza o próprio e leva os demais junto.
  function aoAtualizar(chave: string, aplicar: (patch: never) => void) {
    return (patch: { x?: number; y?: number } & Record<string, unknown>) => {
      (aplicar as (p: unknown) => void)(patch);
      if (patch.x !== undefined && patch.y !== undefined) moverJuntos(chave, patch.x, patch.y);
    };
  }

  // Elementos sobrepostos: uma forma pequena em cima (ou atrás) da área da foto
  // não dava pra selecionar — o clique/arraste caía na foto, que é maior. Regra:
  // entre os elementos que cobrem o ponteiro, vale o de MENOR área (o pequeno
  // dentro do grande continua alcançável; o grande, pelo resto da sua área).
  // Só entram a foto e as formas (com elipse/triângulo medidos de verdade); um
  // campo de texto acertado em cima das letras continua valendo como sempre.
  function alvoSobPonteiro(stage: Konva.Stage | null, chaveNativa: string, noArraste = false): string {
    // No arraste vale onde o botão foi PRESSIONADO: quando o arraste começa o
    // ponteiro pode já ter saído de cima do elemento (movimento rápido).
    const pos = (noArraste ? pressionadoEm.current : null) ?? stage?.getPointerPosition();
    if (!pos) return chaveNativa;
    // Só foto (quadro tracejado) e formas disputam o clique; texto (fixo ou
    // livre) acertado nas letras vale como sempre.
    const nativaEhFoto = CARD_FIELD_DEFS.some((d) => d.key === chaveNativa && d.type === "image");
    if (!nativaEhFoto && !shapes.some((s) => s.id === chaveNativa)) return chaveNativa;

    const melhor = { key: chaveNativa, area: Number.POSITIVE_INFINITY };
    const considerar = (key: string, tipo: CardShape["type"]) => {
      const node = nodeRefs.current[key];
      if (!node || !node.getStage()) return;
      const r = node.getClientRect({ skipStroke: true, skipShadow: true });
      if (r.width <= 0 || r.height <= 0) return;
      if (pos.x < r.x || pos.x > r.x + r.width || pos.y < r.y || pos.y > r.y + r.height) return;
      const px = (pos.x - r.x) / r.width;
      const py = (pos.y - r.y) / r.height;
      if (tipo === "elipse" && (px - 0.5) ** 2 + (py - 0.5) ** 2 > 0.25) return;
      if (tipo === "triangulo" && Math.abs(px - 0.5) > py / 2) return;
      const area = r.width * r.height;
      if (area < melhor.area) {
        melhor.key = key;
        melhor.area = area;
      }
    };
    for (const d of CARD_FIELD_DEFS) if (d.type === "image" && camposHabilitados.includes(d.key)) considerar(d.key, "retangulo");
    for (const sh of shapes) considerar(sh.id, sh.type);
    return melhor.key;
  }

  function chamarSelecao(chave: string, modo: SelectMode) {
    if (ehCampoFixo(chave)) onSelectField(chave as CardFieldKey, modo);
    else onSelectShape(chave, modo); // forma ou texto livre (ids ficam na mesma lista)
  }

  // Clicar num elemento que está num grupo seleciona (ou, com Alt, retira) o
  // grupo inteiro.
  function selecionarEm(chave: string, modo: SelectMode) {
    const exp = expandirPorGrupo(
      { layout, shapes },
      ehCampoFixo(chave) ? { campos: [chave], livres: [] } : { campos: [], livres: [chave] },
      camposHabilitados
    );
    // O elemento clicado entra por ÚLTIMO (a ordem da seleção define a referência
    // do "Centralizar"); os demais do grupo entram antes dele.
    const ordem = [...[...exp.campos, ...exp.livres].filter((k) => k !== chave), chave];
    ordem.forEach((k, i) => chamarSelecao(k, i === 0 ? modo : modo === "remove" ? "remove" : "add"));
  }

  function selectField(key: CardFieldKey, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    selecionarEm(alvoSobPonteiro(e.target.getStage(), key), getSelectMode(e));
  }

  function selectShape(id: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    selecionarEm(alvoSobPonteiro(e.target.getStage(), id), getSelectMode(e));
  }

  // Começou a arrastar um elemento, mas há outro menor sob o ponteiro: cancela
  // este arraste, seleciona o menor e passa o arraste pra ele.
  function redirecionarArraste(chave: string, e: Konva.KonvaEventObject<DragEvent>) {
    const alvo = alvoSobPonteiro(e.target.getStage(), chave, true);
    if (alvo !== chave) {
      const outro = nodeRefs.current[alvo];
      if (outro) {
        e.target.stopDrag();
        selecionarEm(alvo, "replace");
        outro.startDrag(); // dispara o dragstart do outro, que inicia o arraste dele
        return;
      }
    }
    iniciarArraste(chave);
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
  const textoLivreSelecionado = selectedShapeIds.length === 1 && chaveTexto(selectedShapeIds[0]) in layout;
  const isFreeResize = (selectedShapeIds.length === 1 && !textoLivreSelecionado) || selectedDef?.type === "image";
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
        : (["middle-left", "middle-right", "top-center", "bottom-center"] as const);
  const stageW = (gutterMode ? ghostDefaultX + canvasW + ORIGIN : canvasW + ORIGIN * 2) + origem.x;
  const stageH = canvasH + ORIGIN * 2 + origem.y;

  return (
    <Stage
      width={stageW}
      height={stageH}
      onMouseDown={(e) => {
        pressionadoEm.current = e.target.getStage()?.getPointerPosition() ?? null;
        if (e.target === e.target.getStage()) onClearSelection();
      }}
      onTouchStart={(e) => {
        pressionadoEm.current = e.target.getStage()?.getPointerPosition() ?? null;
      }}
      onTap={(e) => {
        if (e.target === e.target.getStage()) onClearSelection();
      }}
    >
      <Layer>
        <Group x={origem.x} y={origem.y}>
        <BoundaryRect
          canvasW={canvasW}
          canvasH={canvasH}
          scale={scale}
          onResize={onResizeBoundary}
          onStart={() => setEscalaFixa(scale)}
          onCommit={({ dx, dy }) => {
            if (dx !== 0 || dy !== 0) {
              onShiftContent(dx, dy);
              setOrigem((o) => ({ x: Math.max(MIN_ORIGEM, o.x + dx * scale), y: Math.max(MIN_ORIGEM, o.y + dy * scale) }));
            }
            setEscalaFixa(null);
          }}
          transformerRef={boundaryTransformerRef}
          borda={borda}
          ativo={selectionCount === 0}
          onClear={onClearSelection}
        />

        {shapes.map((shape) => (
          <ShapeNode
            key={shape.id}
            shape={shape}
            scale={scale}
            selected={selectedShapeIds.includes(shape.id)}
            onSelect={(e) => selectShape(shape.id, e)}
            onUpdate={aoAtualizar(shape.id, (patch: Partial<CardShape>) => updateShape(shape.id, patch))}
            registerRef={registerRef}
            onDragStart={(e) => redirecionarArraste(shape.id, e)}
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
              onUpdate={aoAtualizar(def.key, (patch: CardElementConfig) => updateField(def.key, patch))}
              registerRef={registerRef}
              onDragStart={(e) => redirecionarArraste(def.key, e)}
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
              onUpdate={aoAtualizar(def.key, (patch: CardElementConfig) => updateField(def.key, patch))}
              registerRef={registerRef}
              onDragStart={() => iniciarArraste(def.key)}
              fontsTick={fontsTick}
            />
          )
        )}

        {/* Textos livres (adicionados à mão) — por cima dos campos fixos. */}
        {listarTextosVisiveis(layout).map((t) => (
          <TextFieldNode
            key={t.id}
            fieldKey={t.id}
            cfg={t}
            // texto fixo: "{valor}" digitado fica literal (como na visualização e no PDF)
            sampleText="{valor}"
            scale={scale}
            selected={selectedShapeIds.includes(t.id)}
            onSelect={(e) => selecionarEm(t.id, getSelectMode(e))}
            onUpdate={aoAtualizar(t.id, (patch: CardElementConfig) => updateTexto(t.id, patch))}
            registerRef={registerRef}
            onDragStart={() => iniciarArraste(t.id)}
            fontsTick={fontsTick}
          />
        ))}

        <BoundaryTransformer transformerRef={boundaryTransformerRef} scale={scale} soAltura={larguraTravada} />

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
        </Group>
      </Layer>
    </Stage>
  );
}
