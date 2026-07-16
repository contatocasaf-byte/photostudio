"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Transformer, Rect, Circle } from "react-konva";
import type Konva from "konva";
import { useEditorStore, MIN_SCALE, MAX_SCALE, type EditorSnapshot } from "./EditorStore";
import { floodFillMask } from "./floodFill";
import { loadImage, splitImageIntoLayers, canvasToDataUrl, dataUrlToCanvas, exportFinal, canvasToBlob } from "./canvasUtils";

// Igual ao CANVAS_OUT usado em exportFinal (canvasUtils.ts) DE PROPÓSITO:
// a área de edição precisa ser o mesmo tamanho do canvas exportado, senão
// uma escala calibrada pra "80% de 640px" vira uma porcentagem diferente
// quando aplicada num canvas de 1000px na exportação (foi exatamente o
// bug anterior). Com os dois do mesmo tamanho, o que aparece no editor É
// o resultado final, sem conversão nenhuma.
const VIEW_SIZE = 1000;
// Usado quando o usuário corta manualmente (ferramenta Cortar) — a
// seleção escolhida na hora vira ~85% do quadro.
const FIT_RATIO = 0.85;
// Usado no enquadramento automático (carregar a foto / "Restaurar
// tudo") — o OBJETO em si (sem a margem de respiro do corte) ocupa
// ~80% do canvas final.
const TARGET_OBJECT_RATIO = 0.8;
// Zoom da VISUALIZAÇÃO (câmera) — diferente de mover/rotacionar/zoom do
// objeto (ferramenta "select", que redimensiona de verdade e entra no
// export). Isso aqui só aproxima/afasta a área de trabalho pra editar
// com mais precisão; não altera transform/crop nem o resultado salvo.
const MIN_VIEW_ZOOM = 0.5;
const MAX_VIEW_ZOOM = 4;
const VIEW_ZOOM_STEP = 1.25;

type Props = {
  imageUrl: string;
  // Foto ANTES da remoção de fundo, se disponível — usada como fonte de
  // cor pro lápis restaurar de verdade (ver splitImageIntoLayers).
  originalImageUrl?: string;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
};

function computeOpaqueBBox(maskCanvas: HTMLCanvasElement) {
  const ctx = maskCanvas.getContext("2d")!;
  const { data, width: w, height: h } = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { x: 0, y: 0, width: w, height: h };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Adiciona uma margem de respiro em volta do objeto (senão o corte fica
// colado exatamente na borda, cortando pixels de antialiasing).
function padBBox(
  bbox: { x: number; y: number; width: number; height: number },
  naturalW: number,
  naturalH: number,
  paddingRatio = 0.06
) {
  const padX = bbox.width * paddingRatio;
  const padY = bbox.height * paddingRatio;
  const x = Math.max(0, bbox.x - padX);
  const y = Math.max(0, bbox.y - padY);
  const x2 = Math.min(naturalW, bbox.x + bbox.width + padX);
  const y2 = Math.min(naturalH, bbox.y + bbox.height + padY);
  return { x, y, width: x2 - x, height: y2 - y };
}

export default function PhotoEditor({ imageUrl, originalImageUrl, onClose, onSave }: Props) {
  const store = useEditorStore();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Só afeta a exibição no editor (ajuda a enxergar bordas/áreas removidas
  // que passam despercebidas no fundo quadriculado) — o export/salvo
  // continua sempre transparente, independente disso.
  const [bgMode, setBgMode] = useState<"checker" | "black">("checker");
  const [viewZoom, setViewZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(
    typeof document !== "undefined" ? document.createElement("canvas") : (null as unknown as HTMLCanvasElement)
  );
  const selectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  // Posição do cursor em espaço de view (tela), pra desenhar o círculo do
  // pincel/borracha do tamanho certo em cima da imagem.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  // Retângulo de arrasto do corte, em espaço de view (só feedback visual
  // enquanto arrasta — o corte de verdade só é aplicado no mouseup).
  const [dragCropView, setDragCropView] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );
  const naturalSizeRef = useRef({ width: 0, height: 0 });
  const bboxRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const stageRef = useRef<Konva.Stage | null>(null);
  const imageNodeRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);

  const dragState = useRef<{ tool: string; lastX: number; lastY: number; cropStart?: { x: number; y: number } }>({
    tool: "select",
    lastX: 0,
    lastY: 0,
  });
  // Só pinta/arrasta corte enquanto o botão do mouse está de fato
  // pressionado — sem isso, mousemove sozinho (só passando o cursor)
  // já disparava o pincel.
  const isPointerDown = useRef(false);

  const redrawDisplay = useCallback(() => {
    const orig = origCanvasRef.current;
    const mask = maskCanvasRef.current;
    const display = displayCanvasRef.current;
    if (!orig || !mask || !display) return;
    display.width = orig.width;
    display.height = orig.height;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.drawImage(orig, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    layerRef.current?.batchDraw();
  }, []);

  // Carrega a imagem processada (+ original, se houver) e separa em
  // camadas (orig RGB + máscara).
  useEffect(() => {
    let cancelled = false;
    const originalPromise = originalImageUrl ? loadImage(originalImageUrl) : Promise.resolve(undefined);
    Promise.all([loadImage(imageUrl), originalPromise]).then(([img, originalImg]) => {
      if (cancelled) return;
      const { origCanvas, maskCanvas } = splitImageIntoLayers(img, originalImg);
      origCanvasRef.current = origCanvas;
      maskCanvasRef.current = maskCanvas;
      naturalSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
      bboxRef.current = computeOpaqueBBox(maskCanvas);

      const sel = document.createElement("canvas");
      sel.width = img.naturalWidth;
      sel.height = img.naturalHeight;
      selectionCanvasRef.current = sel;

      // Corte automático ao redor do objeto (com uma margem de respiro),
      // já aplicado de cara — a área de trabalho fica do tamanho do
      // produto, não da imagem inteira original. O ajuste de zoom usa a
      // caixa JUSTA (sem a margem) como referência, pra o objeto em si
      // ocupar ~80% do canvas — não 80% da caixa com margem.
      const padded = padBBox(bboxRef.current, img.naturalWidth, img.naturalHeight);
      store.setCropBox(padded);
      fitCropToView(bboxRef.current, TARGET_OBJECT_RATIO);
      setViewZoom(1);

      redrawDisplay();
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, originalImageUrl]);

  function fitCropToView(box: { width: number; height: number }, ratio: number = FIT_RATIO) {
    const scale = Math.min(VIEW_SIZE / box.width, VIEW_SIZE / box.height) * ratio;
    store.setTransform({ x: VIEW_SIZE / 2, y: VIEW_SIZE / 2, rotation: 0, scaleX: scale, scaleY: scale });
  }

  function zoomIn() {
    setViewZoom((z) => Math.min(MAX_VIEW_ZOOM, Math.round(z * VIEW_ZOOM_STEP * 100) / 100));
  }
  function zoomOut() {
    setViewZoom((z) => Math.max(MIN_VIEW_ZOOM, Math.round((z / VIEW_ZOOM_STEP) * 100) / 100));
  }
  function zoomReset() {
    setViewZoom(1);
  }

  // Mantém a área editada centralizada no viewport ao mudar o zoom — o
  // objeto sempre fica centralizado no meio lógico do canvas (VIEW_SIZE/2),
  // então centralizar nesse ponto equivale a centralizar nele.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const offset = Math.max(0, (VIEW_SIZE * viewZoom - VIEW_SIZE) / 2);
    el.scrollLeft = offset;
    el.scrollTop = offset;
  }, [viewZoom]);

  useEffect(() => {
    if (store.tool === "select" && transformerRef.current && imageNodeRef.current) {
      transformerRef.current.nodes([imageNodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current?.nodes([]);
      transformerRef.current?.getLayer()?.batchDraw();
    }
  }, [store.tool, ready]);

  function currentSnapshot(): EditorSnapshot {
    return {
      transform: { ...store.transform },
      cropBox: store.cropBox,
      maskDataUrl: maskCanvasRef.current ? canvasToDataUrl(maskCanvasRef.current) : "",
    };
  }

  function commitSnapshot() {
    store.pushHistory(currentSnapshot());
  }

  async function applySnapshot(snap: EditorSnapshot) {
    const restored = await dataUrlToCanvas(snap.maskDataUrl);
    maskCanvasRef.current = restored;
    redrawDisplay();
  }

  async function handleUndo() {
    const restored = store.undo(currentSnapshot());
    if (restored) await applySnapshot(restored);
  }

  async function handleRedo() {
    const restored = store.redo(currentSnapshot());
    if (restored) await applySnapshot(restored);
  }

  // Ponteiro (view/stage) -> coordenada na imagem fonte, usando o
  // transform inverso nativo do Konva — substitui a trigonometria manual
  // de _view_to_src_coords do app original.
  function pointerToSource(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const node = imageNodeRef.current;
    if (!stage || !node) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    const inv = node.getAbsoluteTransform().copy().invert();
    const local = inv.point(pos);
    // Com um corte ativo, o (0,0) local do node passa a ser o canto do
    // corte, não da imagem inteira — soma de volta o deslocamento do
    // corte pra chegar na coordenada real dentro de origCanvas/maskCanvas.
    const baseX = store.cropBox?.x ?? 0;
    const baseY = store.cropBox?.y ?? 0;
    return { x: local.x + baseX, y: local.y + baseY };
  }

  function paintAt(x: number, y: number, erase: boolean) {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    const scale = store.transform.scaleX || 1;
    const radius = Math.max(1, store.brushSize / scale / 2);
    // A máscara guarda o valor em ALFA, não em RGB — "apagar" precisa
    // zerar o alfa de verdade (destination-out), não só pintar uma cor
    // escura por cima (que ficava opaca=255 do mesmo jeito).
    ctx.save();
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const tool = store.tool;
    isPointerDown.current = true;
    if (tool === "pencil" || tool === "eraser") {
      const p = pointerToSource();
      if (!p) return;
      commitSnapshot();
      dragState.current = { tool, lastX: p.x, lastY: p.y };
      paintAt(p.x, p.y, tool === "eraser");
      redrawDisplay();
    } else if (tool === "magic") {
      const p = pointerToSource();
      const orig = origCanvasRef.current;
      const sel = selectionCanvasRef.current;
      if (!p || !orig || !sel) return;
      const octx = orig.getContext("2d")!;
      const imgData = octx.getImageData(0, 0, orig.width, orig.height);
      const found = floodFillMask(imgData, p.x, p.y, store.tolerance);

      const mode = e.evt.ctrlKey ? "add" : e.evt.altKey ? "sub" : "new";
      const sctx = sel.getContext("2d")!;
      const prev = mode === "new" ? null : sctx.getImageData(0, 0, sel.width, sel.height);
      const next = sctx.createImageData(sel.width, sel.height);
      for (let i = 0; i < found.length; i++) {
        const o = i * 4;
        let on = found[i] === 255;
        if (mode === "add" && prev && prev.data[o + 3] > 0) on = true;
        if (mode === "sub" && prev && prev.data[o + 3] > 0 && found[i] === 255) on = false;
        else if (mode === "sub" && prev) on = prev.data[o + 3] > 0;
        if (on) {
          next.data[o] = 0;
          next.data[o + 1] = 120;
          next.data[o + 2] = 255;
          next.data[o + 3] = 110;
        }
      }
      sctx.clearRect(0, 0, sel.width, sel.height);
      sctx.putImageData(next, 0, 0);
      setSelectionVersion((v) => v + 1);
    } else if (tool === "crop") {
      const pos = stageRef.current?.getPointerPosition();
      if (!pos) return;
      dragState.current = { tool, lastX: pos.x, lastY: pos.y, cropStart: { x: pos.x, y: pos.y } };
      setDragCropView({ x: pos.x, y: pos.y, width: 0, height: 0 });
    }
  }

  function handleStageMouseMove() {
    const tool = store.tool;
    if (tool === "pencil" || tool === "eraser") {
      const stagePos = stageRef.current?.getPointerPosition();
      // getPointerPosition() vem em pixel absoluto do canvas (já
      // considerando VIEW_SIZE*viewZoom) — o Circle do cursor é filho do
      // Layer, em espaço lógico (0..VIEW_SIZE), daí a divisão.
      if (stagePos) setCursorPos({ x: stagePos.x / viewZoom, y: stagePos.y / viewZoom });
    }
    if (!isPointerDown.current) return;
    if (tool === "pencil" || tool === "eraser") {
      const p = pointerToSource();
      if (!p) return;
      const { lastX, lastY } = dragState.current;
      const dist = Math.hypot(p.x - lastX, p.y - lastY);
      const steps = Math.max(1, Math.ceil(dist / 4));
      for (let s = 1; s <= steps; s++) {
        const ix = lastX + ((p.x - lastX) * s) / steps;
        const iy = lastY + ((p.y - lastY) * s) / steps;
        paintAt(ix, iy, tool === "eraser");
      }
      dragState.current.lastX = p.x;
      dragState.current.lastY = p.y;
      redrawDisplay();
    } else if (tool === "crop" && dragState.current.cropStart) {
      const pos = stageRef.current?.getPointerPosition();
      if (!pos) return;
      const start = dragState.current.cropStart;
      setDragCropView({
        x: Math.min(start.x, pos.x),
        y: Math.min(start.y, pos.y),
        width: Math.abs(pos.x - start.x),
        height: Math.abs(pos.y - start.y),
      });
    }
  }

  function handleStageMouseUp() {
    isPointerDown.current = false;
    const tool = store.tool;
    if (tool === "pencil" || tool === "eraser") {
      // snapshot já foi feito no mousedown (um traço = uma unidade de undo)
    } else if (tool === "crop") {
      const rect = dragCropView;
      dragState.current.cropStart = undefined;
      setDragCropView(null);
      const node = imageNodeRef.current;
      if (rect && rect.width > 4 && rect.height > 4 && node) {
        // Retângulo arrastado (espaço de tela) -> espaço fonte, via
        // transform inverso do node — depois soma o deslocamento do
        // corte que já estava ativo, já que o (0,0) local do node é o
        // canto do corte atual, não da imagem inteira.
        const inv = node.getAbsoluteTransform().copy().invert();
        const p1 = inv.point({ x: rect.x, y: rect.y });
        const p2 = inv.point({ x: rect.x + rect.width, y: rect.y + rect.height });
        const baseX = store.cropBox?.x ?? 0;
        const baseY = store.cropBox?.y ?? 0;
        const sx1 = Math.min(p1.x, p2.x) + baseX;
        const sy1 = Math.min(p1.y, p2.y) + baseY;
        const sx2 = Math.max(p1.x, p2.x) + baseX;
        const sy2 = Math.max(p1.y, p2.y) + baseY;
        const newBox = { x: sx1, y: sy1, width: sx2 - sx1, height: sy2 - sy1 };
        commitSnapshot();
        store.setCropBox(newBox);
        fitCropToView(newBox);
      }
    }
  }

  function applyMagicErase() {
    const sel = selectionCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!sel || !mask) return;
    commitSnapshot();
    const sctx = sel.getContext("2d")!;
    const selData = sctx.getImageData(0, 0, sel.width, sel.height);
    const mctx = mask.getContext("2d")!;
    const maskData = mctx.getImageData(0, 0, mask.width, mask.height);
    for (let i = 0; i < selData.data.length; i += 4) {
      if (selData.data[i + 3] > 0) {
        maskData.data[i + 3] = 0; // zera o ALFA — é isso que a composição consulta
      }
    }
    mctx.putImageData(maskData, 0, 0);
    clearSelection();
    redrawDisplay();
  }

  function clearSelection() {
    const sel = selectionCanvasRef.current;
    if (!sel) return;
    sel.getContext("2d")!.clearRect(0, 0, sel.width, sel.height);
    setSelectionVersion((v) => v + 1);
  }

  function handleTransformEnd() {
    const node = imageNodeRef.current;
    if (!node) return;
    store.setTransform({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
    });
    commitSnapshot();
  }

  function handleDragEnd() {
    handleTransformEnd();
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    const node = imageNodeRef.current;
    // Fora da ferramenta "mover/rotacionar/zoom", deixa o scroll nativo do
    // container (overflow-auto) rolar/pan pela visualização com zoom —
    // só a ferramenta select usa a roda pra redimensionar o objeto.
    if (!node || store.tool !== "select") return;
    e.evt.preventDefault();
    const factor = e.evt.deltaY < 0 ? 1.06 : 0.94;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, node.scaleX() * factor));
    node.scaleX(next);
    node.scaleY(next);
    layerRef.current?.batchDraw();
    handleTransformEnd();
  }

  function handleReset() {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    commitSnapshot();
    // Recalcula a partir da máscara ATUAL (que pode já ter edições de
    // lápis/borracha/varinha) — "restaurar" volta o enquadramento/corte
    // ao redor do objeto, não desfaz pintura (pra isso é o Desfazer).
    const bbox = computeOpaqueBBox(mask);
    const padded = padBBox(bbox, naturalSizeRef.current.width, naturalSizeRef.current.height);
    store.setCropBox(padded);
    fitCropToView(bbox, TARGET_OBJECT_RATIO);
    setViewZoom(1);
  }

  async function handleSave() {
    const orig = origCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!orig || !mask) return;
    setSaving(true);
    setError(null);
    try {
      const out = exportFinal(orig, mask, store.transform, store.cropBox);
      const blob = await canvasToBlob(out);
      await onSave(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.tool === "magic") applyMagicErase();
      } else if (e.key === "Escape") {
        clearSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Editar foto</h2>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
            Fechar
          </button>
        </div>

        <div className="flex flex-1 gap-4 overflow-auto p-4">
          <div className="flex flex-col gap-2">
            <ToolButton label="Mover/rotacionar/zoom" active={store.tool === "select"} onClick={() => store.setTool("select")} />
            <ToolButton label="Lápis" active={store.tool === "pencil"} onClick={() => store.setTool("pencil")} />
            <ToolButton label="Borracha" active={store.tool === "eraser"} onClick={() => store.setTool("eraser")} />
            <ToolButton label="Varinha mágica" active={store.tool === "magic"} onClick={() => store.setTool("magic")} />
            <ToolButton label="Cortar" active={store.tool === "crop"} onClick={() => store.setTool("crop")} />

            {(store.tool === "pencil" || store.tool === "eraser") && (
              <div className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Tamanho do pincel</span>
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={store.brushSize}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n)) store.setBrushSize(Math.min(200, Math.max(2, n)));
                    }}
                    className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right"
                  />
                </div>
                <input
                  type="range"
                  min={2}
                  max={200}
                  value={store.brushSize}
                  onChange={(e) => store.setBrushSize(Number(e.target.value))}
                />
              </div>
            )}

            {store.tool === "magic" && (
              <>
                <label className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
                  Tolerância ({store.tolerance})
                  <input
                    type="range"
                    min={1}
                    max={120}
                    value={store.tolerance}
                    onChange={(e) => store.setTolerance(Number(e.target.value))}
                  />
                </label>
                <button
                  onClick={applyMagicErase}
                  className="mt-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                >
                  Apagar seleção (Delete)
                </button>
                <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-900">
                  Limpar seleção (Esc)
                </button>
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleUndo}
                disabled={store.history.length === 0}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                Desfazer
              </button>
              <button
                onClick={handleRedo}
                disabled={store.future.length === 0}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                Refazer
              </button>
            </div>
            <button onClick={handleReset} className="mt-1 text-xs text-slate-500 hover:text-slate-900">
              Restaurar tudo
            </button>

            <div className="mt-4 flex flex-col gap-1 text-xs text-slate-600">
              <span>Zoom da visualização</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={zoomOut}
                  disabled={viewZoom <= MIN_VIEW_ZOOM}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm leading-none disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-12 text-center">{Math.round(viewZoom * 100)}%</span>
                <button
                  onClick={zoomIn}
                  disabled={viewZoom >= MAX_VIEW_ZOOM}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm leading-none disabled:opacity-40"
                >
                  +
                </button>
              </div>
              {viewZoom !== 1 && (
                <button onClick={zoomReset} className="text-left text-[11px] text-slate-400 hover:text-slate-700">
                  Redefinir zoom (100%)
                </button>
              )}
              <span className="text-[11px] text-slate-400">
                Só aproxima a visualização, não redimensiona a imagem.
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-1 text-xs text-slate-600">
              <span>Fundo do editor</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setBgMode("checker")}
                  className={
                    "rounded-md px-2 py-1 text-xs font-medium " +
                    (bgMode === "checker" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                  }
                >
                  Quadriculado
                </button>
                <button
                  onClick={() => setBgMode("black")}
                  className={
                    "rounded-md px-2 py-1 text-xs font-medium " +
                    (bgMode === "black" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                  }
                >
                  Preto
                </button>
              </div>
              <span className="text-[11px] text-slate-400">Só na visualização — o salvo continua transparente.</span>
            </div>
          </div>

          <div
            ref={viewportRef}
            className="relative shrink-0 overflow-auto rounded border border-slate-200"
            style={
              bgMode === "black"
                ? { width: VIEW_SIZE, height: VIEW_SIZE, backgroundColor: "#000" }
                : {
                    width: VIEW_SIZE,
                    height: VIEW_SIZE,
                    backgroundImage:
                      "linear-gradient(45deg, #e8eaed 25%, transparent 25%), linear-gradient(-45deg, #e8eaed 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8eaed 75%), linear-gradient(-45deg, transparent 75%, #e8eaed 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                  }
            }
          >
            {!ready && <p className="p-4 text-sm text-slate-500">Carregando...</p>}
            {ready && (
              <Stage
                ref={stageRef}
                width={VIEW_SIZE * viewZoom}
                height={VIEW_SIZE * viewZoom}
                scaleX={viewZoom}
                scaleY={viewZoom}
                onMouseDown={handleStageMouseDown}
                onMouseMove={handleStageMouseMove}
                onMouseUp={handleStageMouseUp}
                onMouseLeave={() => {
                  handleStageMouseUp();
                  setCursorPos(null);
                }}
                onWheel={handleWheel}
              >
                <Layer ref={layerRef}>
                  <KonvaImage
                    ref={imageNodeRef}
                    image={displayCanvasRef.current}
                    x={store.transform.x}
                    y={store.transform.y}
                    rotation={store.transform.rotation}
                    scaleX={store.transform.scaleX}
                    scaleY={store.transform.scaleY}
                    crop={store.cropBox ?? undefined}
                    width={store.cropBox ? store.cropBox.width : naturalSizeRef.current.width}
                    height={store.cropBox ? store.cropBox.height : naturalSizeRef.current.height}
                    offsetX={store.cropBox ? store.cropBox.width / 2 : bboxRef.current.x + bboxRef.current.width / 2}
                    offsetY={store.cropBox ? store.cropBox.height / 2 : bboxRef.current.y + bboxRef.current.height / 2}
                    draggable={store.tool === "select"}
                    onDragEnd={handleDragEnd}
                    onTransformEnd={handleTransformEnd}
                  />
                  {selectionCanvasRef.current && (
                    <KonvaImage
                      image={selectionCanvasRef.current}
                      x={store.transform.x}
                      y={store.transform.y}
                      rotation={store.transform.rotation}
                      scaleX={store.transform.scaleX}
                      scaleY={store.transform.scaleY}
                      crop={store.cropBox ?? undefined}
                      width={store.cropBox ? store.cropBox.width : naturalSizeRef.current.width}
                      height={store.cropBox ? store.cropBox.height : naturalSizeRef.current.height}
                      offsetX={store.cropBox ? store.cropBox.width / 2 : bboxRef.current.x + bboxRef.current.width / 2}
                      offsetY={
                        store.cropBox ? store.cropBox.height / 2 : bboxRef.current.y + bboxRef.current.height / 2
                      }
                      listening={false}
                      key={selectionVersion}
                    />
                  )}
                  {store.tool === "select" && (
                    <Transformer
                      ref={transformerRef}
                      enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                      rotateAnchorOffset={18}
                      keepRatio={true}
                      boundBoxFunc={(oldBox, newBox) => {
                        const node = imageNodeRef.current;
                        if (!node) return newBox;
                        const w = (store.cropBox ? store.cropBox.width : naturalSizeRef.current.width) || 1;
                        const scale = newBox.width / w;
                        if (scale < MIN_SCALE || scale > MAX_SCALE) return oldBox;
                        return newBox;
                      }}
                    />
                  )}
                  {dragCropView && (
                    // dragCropView guarda pixel absoluto do canvas (igual ao
                    // que handleStageMouseUp espera pra converter em
                    // coordenada fonte via transform inverso) — só o
                    // preview visual aqui precisa voltar pro espaço lógico
                    // do Layer, daí a divisão por viewZoom.
                    <Rect
                      x={dragCropView.x / viewZoom}
                      y={dragCropView.y / viewZoom}
                      width={dragCropView.width / viewZoom}
                      height={dragCropView.height / viewZoom}
                      stroke="#e03020"
                      dash={[6, 4]}
                      listening={false}
                    />
                  )}
                  {(store.tool === "pencil" || store.tool === "eraser") && cursorPos && (
                    <Circle
                      x={cursorPos.x}
                      y={cursorPos.y}
                      radius={store.brushSize / 2}
                      stroke={store.tool === "eraser" ? "#e03020" : "#1a56c4"}
                      strokeWidth={1.5}
                      listening={false}
                    />
                  )}
                </Layer>
              </Stage>
            )}
          </div>
        </div>

        {error && <p className="px-4 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!ready || saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-md px-3 py-1.5 text-left text-xs font-medium " +
        (active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
      }
    >
      {label}
    </button>
  );
}

// Reseta o store global ao desmontar não é necessário aqui — cada
// abertura do editor cria uma nova instância lógica via `key` no
// componente pai (ver IndividualUpload/BatchUpload), então o estado
// (tool, histórico) deve ser resetado explicitamente pelo chamador se
// reabrir pra outra foto sem desmontar. Ver `resetAll()` em EditorStore.
export function useResetEditorOnOpen(open: boolean) {
  const resetAll = useEditorStore((s) => s.resetAll);
  useEffect(() => {
    if (open) resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
