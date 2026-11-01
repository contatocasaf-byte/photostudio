"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Stage, Layer, Group, Image as KonvaImage, Rect, Shape as KonvaShape, Transformer } from "react-konva";
import type Konva from "konva";
import {
  DEFAULT_FONT_FAMILY,
  fontPairsFromPageLayout,
  PAGE_FIELD_DEFS,
  substitutePlaceholders,
  type Margens,
  type PageElementConfig,
  type PageFieldKey,
  type PageIllustration,
  type PageImageElementConfig,
  type PageLayout,
  type PageShape,
  type PageTextElementConfig,
} from "../../../core/pageConfig";
import { drawTextFit } from "@/lib/canvasText";
import { loadImage } from "@/lib/loadImage";
import { fitImageOnCanvas, loadImageToCanvas } from "@/lib/fitImageOnCanvas";
import { ensureFontsLoaded } from "@/lib/fonts/fontLoader";

const PREVIEW_MAX = 480;
const MIN_BOUNDARY = 200;
const MIN_FIELD_SIZE = 20;
const ORIGIN = 56;
// Folga mínima (px) entre a borda do palco e o card/página ao empurrá-lo pra
// fora (esquerda/cima) — ver `origem` em PageEditorCanvas.
const MIN_ORIGEM_FOLGA = 8;
const MIN_ORIGEM = -(ORIGIN - MIN_ORIGEM_FOLGA);

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
  // Ao começar a arrastar: o canvas passa o arraste pro MENOR elemento sob o
  // ponteiro quando há sobreposição (ver alvoSobPonteiro).
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
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
  onDragStart,
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
        onDragStart={onDragStart}
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
      onDragStart={onDragStart}
      onDragMove={handleDrag}
      onDragEnd={handleDrag}
      onTransform={handleTransform}
    />
  );
}

// Ilustração de página (Fase 5, Parte 13) — mesmo desenho/comportamento
// de ImageFieldNode (contentFit sempre ligado, igual o antigo campo
// único de ilustração já usava), só que registrada por `id` próprio em
// vez de um PageFieldKey fixo, já que agora é uma lista sem limite.
function IllustrationNode({
  illustration,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
  onDragStart,
}: {
  illustration: PageIllustration;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<PageIllustration>) => void;
  registerRef: (key: string, node: Konva.Node | null) => void;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = illustration.url;
    const task = !url ? Promise.resolve(null) : loadImageToCanvas(url).then((source) => fitImageOnCanvas(source, illustration.w, illustration.h));
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
  }, [illustration.url, illustration.w, illustration.h]);

  const x = ORIGIN + illustration.x * scale;
  const y = ORIGIN + illustration.y * scale;
  const width = illustration.w * scale;
  const height = illustration.h * scale;

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
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart,
    onDragMove: handleDrag,
    onDragEnd: handleDrag,
    onTransform: handleTransform,
  };

  if (img) {
    return (
      <KonvaImage
        ref={(node) => registerRef(illustration.id, node)}
        image={img}
        stroke={selected ? "#4fc3f7" : undefined}
        strokeWidth={selected ? 3 : 0}
        {...common}
      />
    );
  }

  return (
    <Rect
      ref={(node) => registerRef(illustration.id, node)}
      stroke="#4fc3f7"
      strokeWidth={selected ? 3 : 2}
      dash={[6, 4]}
      fill="rgba(79,195,247,0.08)"
      {...common}
    />
  );
}

// Forma decorativa (retângulo/elipse/triângulo) — mesmo padrão do
// ShapeNode do card-molde (CardEditorCanvas.tsx): retângulo usa o
// <Rect> nativo do Konva, elipse/triângulo usam <Shape> com sceneFunc
// custom (desenha via Canvas 2D direto), assim os três continuam com
// x()/y()/width()/height() padrão, compatíveis com o mesmo Transformer
// dos outros elementos.
function PageShapeNode({
  shape,
  scale,
  selected,
  onSelect,
  onUpdate,
  registerRef,
  onDragStart,
}: {
  shape: PageShape;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<PageShape>) => void;
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
// decisão na Parte 3 do plano). Só redimensionável (Transformer próprio, 4
// cantos + 4 pontos médios), nunca arrastável, e as alças só aparecem quando a
// PÁGINA está selecionada (nenhum elemento/ilustração/forma selecionado) —
// mesmo comportamento do card-molde (ver CardEditorCanvas).
//
// Arrastar a borda de CIMA ou da ESQUERDA move aquela borda (a oposta fica
// parada) e os elementos ficam no mesmo lugar da tela; ao soltar, o
// deslocamento vira um ajuste de -dx/-dy nos elementos DESTE modelo (onCommit).
// O tamanho da página vale pra todo o catálogo, mas só este modelo é
// reposicionado. A escala fica congelada durante o arraste (onStart/onCommit).
//
// `keepRatio` (default do Konva, true) só afeta os cantos: mantêm a proporção
// altura×largura. NUNCA desligar via `keepRatio={false}` — os CANTOS também
// perderiam o travamento de proporção.
function BoundaryRect({
  canvasW,
  canvasH,
  scale,
  onResize,
  onStart,
  onCommit,
  transformerRef,
  ativo,
  onClear,
  pos,
  onPos,
}: {
  canvasW: number;
  canvasH: number;
  scale: number;
  onResize: (patch: { largura: number; altura: number }) => void;
  onStart: () => void;
  onCommit: (deslocamento: { dx: number; dy: number }) => void;
  transformerRef: RefObject<Konva.Transformer | null>;
  ativo: boolean;
  onClear: () => void;
  // Posição da página durante o arraste de uma borda de cima/esquerda (o fundo
  // e a margem acompanham) — controlada pelo componente pai.
  pos: { x: number; y: number };
  onPos: (pos: { x: number; y: number }) => void;
}) {
  const rectRef = useRef<Konva.Rect>(null);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr || !rectRef.current) return;
    tr.nodes(ativo ? [rectRef.current] : []);
    tr.getLayer()?.batchDraw();
  }, [transformerRef, ativo]);

  return (
    <Rect
      ref={rectRef}
      x={pos.x}
      y={pos.y}
      width={canvasW}
      height={canvasH}
      fill="#ffffff"
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
        // x/y NÃO são forçados de volta: o Konva já os ajusta pra manter a borda
        // oposta parada.
        onPos({ x: node.x(), y: node.y() });
        onResize({ largura: newLargura, altura: newAltura });
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        const dx = Math.round((node.x() - ORIGIN) / scale);
        const dy = Math.round((node.y() - ORIGIN) / scale);
        node.x(ORIGIN);
        node.y(ORIGIN);
        onPos({ x: ORIGIN, y: ORIGIN });
        onCommit({ dx, dy });
      }}
    />
  );
}

// Alças da página — desenhadas DEPOIS dos elementos (no topo da pilha); por
// baixo, um elemento sobre a alça roubava o clique.
function BoundaryTransformer({ transformerRef, scale }: { transformerRef: RefObject<Konva.Transformer | null>; scale: number }) {
  return (
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

// Plano de fundo cobrindo a página inteira (textura, moldura
// decorativa, arte de seção) — ao contrário dos campos de cabeçalho/
// rodapé, não é posicionável/redimensionável: sempre preenche o
// boundary inteiro, esticando se a proporção do arquivo não bater
// exatamente (mesmo tratamento do "layout" do Gerador de Ofertas, que
// também sempre preenche o canvas por completo).
function BackgroundImage({ url, canvasW, canvasH, x, y }: { url: string | null; canvasW: number; canvasH: number; x: number; y: number }) {
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
  return <KonvaImage image={img} x={x} y={y} width={canvasW} height={canvasH} listening={false} />;
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
  illustracoes: PageIllustration[];
  onIllustracoesChange: (updater: (prev: PageIllustration[]) => PageIllustration[]) => void;
  selectedIllustrationId: string | null;
  onSelectIllustration: (id: string | null) => void;
  formas: PageShape[];
  onFormasChange: (updater: (prev: PageShape[]) => PageShape[]) => void;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
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
  illustracoes,
  onIllustracoesChange,
  selectedIllustrationId,
  onSelectIllustration,
  formas,
  onFormasChange,
  selectedShapeId,
  onSelectShape,
}: PageEditorCanvasProps) {
  // Escala congelada enquanto uma borda da página é arrastada (ver BoundaryRect).
  const [escalaFixa, setEscalaFixa] = useState<number | null>(null);
  // Deslocamento da página no palco (px de tela) depois de arrastar a borda de
  // cima/esquerda: a página fica onde foi solta, sem pulo (ver CardEditorCanvas).
  const [origem, setOrigem] = useState({ x: 0, y: 0 });
  const [posPagina, setPosPagina] = useState({ x: ORIGIN, y: ORIGIN });
  // Onde o botão do mouse (ou o dedo) foi pressionado por último, no palco.
  const pressionadoEm = useRef<{ x: number; y: number } | null>(null);
  const base = computeScale(largura, altura);
  const scale = escalaFixa ?? base.scale;
  const canvasW = escalaFixa !== null ? Math.round(largura * scale) : base.canvasW;
  const canvasH = escalaFixa !== null ? Math.round(altura * scale) : base.canvasH;

  // Um mapa só, chaveado por string (PageFieldKey ou id de ilustração)
  // — os dois tipos de elemento compartilham o mesmo Transformer, só
  // um pode estar selecionado por vez (ver seleção mutuamente
  // exclusiva no componente pai, page.tsx).
  const nodeRefs = useRef<Record<string, Konva.Node>>({});
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

  function registerRef(key: string, node: Konva.Node | null) {
    if (node) nodeRefs.current[key] = node;
  }

  useEffect(() => {
    const tr = fieldTransformerRef.current;
    if (!tr) return;
    const selectedRefKey = selectedShapeId ?? selectedIllustrationId ?? selectedKey;
    const node = selectedRefKey ? nodeRefs.current[selectedRefKey] : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  });

  function updateField<K extends PageFieldKey>(key: K, patch: PageElementConfig) {
    onLayoutChange((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function updateIllustration(id: string, patch: Partial<PageIllustration>) {
    onIllustracoesChange((prev) => prev.map((ill) => (ill.id === id ? { ...ill, ...patch } : ill)));
  }

  function updateShape(id: string, patch: Partial<PageShape>) {
    onFormasChange((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  const nadaSelecionado = selectedKey === null && selectedIllustrationId === null && selectedShapeId === null;

  // Seleciona pela chave do nó (campo, ilustração ou forma — seleção exclusiva).
  function selecionarChave(chave: string) {
    if (formas.some((f) => f.id === chave)) {
      onSelect(null);
      onSelectIllustration(null);
      onSelectShape(chave);
    } else if (illustracoes.some((i) => i.id === chave)) {
      onSelect(null);
      onSelectShape(null);
      onSelectIllustration(chave);
    } else {
      onSelectIllustration(null);
      onSelectShape(null);
      onSelect(chave as PageFieldKey);
    }
  }

  // Elementos sobrepostos: entre os que cobrem o ponteiro vale o de MENOR
  // área (o pequeno dentro do grande continua alcançável; o grande, pelo resto
  // da sua área). Só entram formas (elipse/triângulo medidos pelo formato) e
  // quadros tracejados de imagem ainda sem arquivo; texto e imagem carregada
  // acertados nos pixels continuam valendo como sempre (hit por transparência).
  function alvoSobPonteiro(stage: Konva.Stage | null, chaveNativa: string, noArraste = false): string {
    // No arraste vale onde o botão foi PRESSIONADO: quando o arraste começa o
    // ponteiro pode já ter saído de cima do elemento.
    const pos = (noArraste ? pressionadoEm.current : null) ?? stage?.getPointerPosition();
    if (!pos) return chaveNativa;
    const ehForma = formas.some((f) => f.id === chaveNativa);
    const nativo = nodeRefs.current[chaveNativa];
    if (!nativo || (!ehForma && nativo.getClassName() !== "Rect")) return chaveNativa;

    const melhor = { key: chaveNativa, area: Number.POSITIVE_INFINITY };
    const considerar = (key: string, tipo: PageShape["type"]) => {
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
    for (const f of formas) considerar(f.id, f.type);
    for (const ill of illustracoes) if (nodeRefs.current[ill.id]?.getClassName() === "Rect") considerar(ill.id, "retangulo");
    for (const d of PAGE_FIELD_DEFS) {
      if (d.type === "image" && elementosHabilitados.includes(d.key) && nodeRefs.current[d.key]?.getClassName() === "Rect") {
        considerar(d.key, "retangulo");
      }
    }
    return melhor.key;
  }

  function aoSelecionar(chave: string) {
    selecionarChave(alvoSobPonteiro(nodeRefs.current[chave]?.getStage() ?? null, chave));
  }

  // Começou a arrastar um elemento, mas há outro menor sob o ponteiro: cancela
  // este arraste, seleciona o menor e passa o arraste pra ele.
  function redirecionarArraste(chave: string, e: Konva.KonvaEventObject<DragEvent>) {
    const alvo = alvoSobPonteiro(e.target.getStage(), chave, true);
    if (alvo === chave) return;
    const outro = nodeRefs.current[alvo];
    if (!outro) return;
    e.target.stopDrag();
    selecionarChave(alvo);
    outro.startDrag();
  }

  // Borda de cima/esquerda solta: os elementos andam -dx/-dy (as coordenadas
  // deles são relativas ao canto superior-esquerdo da página) pra ficarem no
  // mesmo lugar da tela. Margens são relativas à borda da página: não mudam.
  function deslocarConteudo(dx: number, dy: number) {
    onLayoutChange((prev) => {
      const next = { ...prev } as Record<string, { x: number; y: number }>;
      for (const key of Object.keys(next)) next[key] = { ...next[key], x: next[key].x - dx, y: next[key].y - dy };
      return next as unknown as PageLayout;
    });
    onIllustracoesChange((prev) => prev.map((i) => ({ ...i, x: i.x - dx, y: i.y - dy })));
    onFormasChange((prev) => prev.map((f) => ({ ...f, x: f.x - dx, y: f.y - dy })));
  }

  const selectedDef = selectedKey ? PAGE_FIELD_DEFS.find((d) => d.key === selectedKey) : null;
  // Ilustração/forma selecionada usa o mesmo conjunto de âncoras livres
  // (8 pontos) já usado pro campo de imagem — redimensiona livre em
  // qualquer eixo.
  const isFreeResize = selectedDef?.type === "image" || selectedIllustrationId !== null || selectedShapeId !== null;
  const stageW = canvasW + ORIGIN * 2 + origem.x;
  const stageH = canvasH + ORIGIN * 2 + origem.y;

  const marginRect = {
    x: posPagina.x + margens.left * scale,
    y: posPagina.y + margens.top * scale,
    width: Math.max(0, canvasW - (margens.left + margens.right) * scale),
    height: Math.max(0, canvasH - (margens.top + margens.bottom) * scale),
  };

  return (
    <Stage
      width={stageW}
      height={stageH}
      onMouseDown={(e) => {
        pressionadoEm.current = e.target.getStage()?.getPointerPosition() ?? null;
        if (e.target === e.target.getStage()) {
          onSelect(null);
          onSelectIllustration(null);
          onSelectShape(null);
        }
      }}
      onTouchStart={(e) => {
        pressionadoEm.current = e.target.getStage()?.getPointerPosition() ?? null;
      }}
      onTap={(e) => {
        if (e.target === e.target.getStage()) {
          onSelect(null);
          onSelectIllustration(null);
          onSelectShape(null);
        }
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
              deslocarConteudo(dx, dy);
              setOrigem((o) => ({ x: Math.max(MIN_ORIGEM, o.x + dx * scale), y: Math.max(MIN_ORIGEM, o.y + dy * scale) }));
            }
            setEscalaFixa(null);
          }}
          transformerRef={boundaryTransformerRef}
          ativo={nadaSelecionado}
          onClear={() => {
            onSelect(null);
            onSelectIllustration(null);
            onSelectShape(null);
          }}
          pos={posPagina}
          onPos={setPosPagina}
        />

        <BackgroundImage url={fundoUrl} canvasW={canvasW} canvasH={canvasH} x={posPagina.x} y={posPagina.y} />

        <Rect {...marginRect} stroke="#f59e0b" strokeWidth={1} dash={[3, 3]} listening={false} />

        {formas.map((shape) => (
          <PageShapeNode
            key={shape.id}
            shape={shape}
            scale={scale}
            selected={selectedShapeId === shape.id}
            onSelect={() => aoSelecionar(shape.id)}
            onUpdate={(patch) => updateShape(shape.id, patch)}
            registerRef={registerRef}
            onDragStart={(e) => redirecionarArraste(shape.id, e)}
          />
        ))}

        {illustracoes.map((ill) => (
          <IllustrationNode
            key={ill.id}
            illustration={ill}
            scale={scale}
            selected={selectedIllustrationId === ill.id}
            onSelect={() => aoSelecionar(ill.id)}
            onUpdate={(patch) => updateIllustration(ill.id, patch)}
            registerRef={registerRef}
            onDragStart={(e) => redirecionarArraste(ill.id, e)}
          />
        ))}

        {PAGE_FIELD_DEFS.filter((d) => elementosHabilitados.includes(d.key)).map((def) =>
          def.type === "image" ? (
            <ImageFieldNode
              key={def.key}
              fieldKey={def.key}
              cfg={layout[def.key] as PageImageElementConfig}
              scale={scale}
              selected={selectedKey === def.key}
              onSelect={() => aoSelecionar(def.key)}
              onUpdate={(patch) => updateField(def.key, patch)}
              registerRef={registerRef}
              onDragStart={(e) => redirecionarArraste(def.key, e)}
              contentFit={def.key === "logo"}
            />
          ) : (
            <TextFieldNode
              key={def.key}
              fieldKey={def.key}
              cfg={layout[def.key] as PageTextElementConfig}
              scale={scale}
              selected={selectedKey === def.key}
              onSelect={() => selecionarChave(def.key)}
              onUpdate={(patch) => updateField(def.key, patch)}
              registerRef={registerRef}
              fontsTick={fontsTick}
            />
          )
        )}

        <BoundaryTransformer transformerRef={boundaryTransformerRef} scale={scale} />

        <Transformer
          ref={fieldTransformerRef}
          enabledAnchors={
            isFreeResize
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
        </Group>
      </Layer>
    </Stage>
  );
}
