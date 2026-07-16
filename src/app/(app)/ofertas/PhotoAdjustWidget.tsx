"use client";

import { useEffect, useMemo, useRef } from "react";
import { fitImageOnCanvas, loadImageToCanvas } from "./core/fitImageOnCanvas";

const PREVIEW_W = 260;
const PREVIEW_H = 260;

export type PhotoTransform = { rotation: number; zoom: number; offsetX: number; offsetY: number };

const DEFAULT_TRANSFORM: PhotoTransform = { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 };

type Props = {
  photoUrl: string | null;
  boxW: number; // proporção da caixa do produto do layout (só a razão importa, não pixels reais)
  boxH: number;
  transform: PhotoTransform;
  onChange: (transform: PhotoTransform) => void;
};

// Espelha photo_adjust.py: prévia em tempo real de como a foto fica
// recortada dentro da caixa do produto, com rotação (botões ±90° +
// campo), zoom (roda do mouse ou slider/campo, 10%-300%) e posição
// (arrastar na prévia ou campos X/Y numéricos, -100 a 100).
export default function PhotoAdjustWidget({ photoUrl, boxW, boxH, transform, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const productCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  // Tamanho do preview derivado só da proporção da caixa do layout —
  // não precisa de estado/effect próprio, é puramente calculado.
  const previewSize = useMemo(() => {
    const boxRatio = boxW / boxH;
    let pw: number, ph: number;
    if (boxRatio >= 1) {
      pw = PREVIEW_W;
      ph = Math.round(PREVIEW_W / boxRatio);
    } else {
      ph = PREVIEW_H;
      pw = Math.round(PREVIEW_H * boxRatio);
    }
    return { pw: Math.max(20, pw), ph: Math.max(20, ph) };
  }, [boxW, boxH]);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);

    const product = productCanvasRef.current;
    if (!product) return;

    const { pw, ph } = previewSize;
    const cropped = fitImageOnCanvas(product, pw, ph, transform);

    const ox = Math.floor((PREVIEW_W - pw) / 2);
    const oy = Math.floor((PREVIEW_H - ph) / 2);

    // Fundo quadriculado simples pra indicar transparência
    ctx.fillStyle = "#282840";
    ctx.fillRect(ox, oy, pw, ph);
    ctx.drawImage(cropped, ox, oy);

    ctx.strokeStyle = "#4fc3f7";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 1, oy - 1, pw + 2, ph + 2);
  }

  useEffect(() => {
    let cancelled = false;
    if (!photoUrl) {
      productCanvasRef.current = null;
      redraw();
      return;
    }
    loadImageToCanvas(photoUrl).then((canvas) => {
      if (cancelled) return;
      productCanvasRef.current = canvas;
      redraw();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUrl]);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform, previewSize]);

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  function nudgeRotation(delta: number) {
    let rotation = (transform.rotation + delta) % 360;
    if (rotation > 180) rotation -= 360;
    if (rotation < -180) rotation += 360;
    onChange({ ...transform, rotation });
  }

  function applyRotationField(value: string) {
    const val = parseFloat(value);
    onChange({ ...transform, rotation: Number.isNaN(val) ? 0 : val });
  }

  function applyZoomPercent(percent: number) {
    const clamped = clamp(percent, 10, 300);
    onChange({ ...transform, zoom: clamped / 100 });
  }

  function zoomStep(direction: number) {
    const next = clamp(transform.zoom + direction * 0.05, 0.1, 3.0);
    onChange({ ...transform, zoom: next });
  }

  function applyOffsetFields(xPercent: number, yPercent: number) {
    onChange({
      ...transform,
      offsetX: clamp(xPercent / 100, -1, 1),
      offsetY: clamp(yPercent / 100, -1, 1),
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: transform.offsetX,
      startOffsetY: transform.offsetY,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const refW = Math.max(1, previewSize.pw);
    const refH = Math.max(1, previewSize.ph);
    const offsetX = clamp(dragRef.current.startOffsetX + dx / refW, -1, 1);
    const offsetY = clamp(dragRef.current.startOffsetY + dy / refH, -1, 1);
    onChange({ ...transform, offsetX, offsetY });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    zoomStep(e.deltaY < 0 ? 1 : -1);
  }

  function reset() {
    onChange(DEFAULT_TRANSFORM);
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="shrink-0">
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="cursor-move rounded-lg bg-[#0f0f23]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        />
        <p className="mt-1 text-center text-xs text-slate-400">Arraste para posicionar • roda do mouse pra zoom</p>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-slate-600">Rotação:</span>
          <button
            onClick={() => nudgeRotation(-90)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          >
            ↺ -90°
          </button>
          <button
            onClick={() => nudgeRotation(90)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          >
            ↻ +90°
          </button>
          <input
            type="number"
            value={Math.round(transform.rotation)}
            onChange={(e) => applyRotationField(e.target.value)}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-400">graus</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-slate-600">Zoom:</span>
          <input
            type="range"
            min={10}
            max={300}
            value={Math.round(transform.zoom * 100)}
            onChange={(e) => applyZoomPercent(Number(e.target.value))}
            className="w-32"
          />
          <input
            type="number"
            min={10}
            max={300}
            value={Math.round(transform.zoom * 100)}
            onChange={(e) => applyZoomPercent(Number(e.target.value))}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-400">%</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-slate-600">Posição:</span>
          <span className="text-xs text-slate-400">X</span>
          <input
            type="number"
            min={-100}
            max={100}
            value={Math.round(transform.offsetX * 100)}
            onChange={(e) => applyOffsetFields(Number(e.target.value), Math.round(transform.offsetY * 100))}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-400">Y</span>
          <input
            type="number"
            min={-100}
            max={100}
            value={Math.round(transform.offsetY * 100)}
            onChange={(e) => applyOffsetFields(Math.round(transform.offsetX * 100), Number(e.target.value))}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-400">(-100 a 100)</span>
        </div>

        <button onClick={reset} className="w-fit rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
          ↺ Restaurar ajustes desta foto
        </button>
      </div>
    </div>
  );
}
