import { create } from "zustand";

export type Tool = "select" | "pencil" | "eraser" | "magic" | "crop";

export type CropBox = { x: number; y: number; width: number; height: number } | null;

export type Transform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

// Escala mínima/máxima igual ao original (MIN_SC/MAX_SC,
// removedor_fundo.py:1120-1125 e afins) — 4% a 600%.
export const MIN_SCALE = 0.04;
export const MAX_SCALE = 6.0;

export function createInitialTransform(): Transform {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

// Snapshot completo pra desfazer/refazer — decisão tomada de expandir o
// desfazer pra cobrir tudo (transform + corte + máscara de pintura), não
// só traços de lápis/borracha como no app original.
export type EditorSnapshot = {
  transform: Transform;
  cropBox: CropBox;
  maskDataUrl: string;
};

const MAX_HISTORY = 50;

type EditorState = {
  tool: Tool;
  brushSize: number; // 2-200, espaço de view — igual ao original
  tolerance: number; // 1-120, padrão 32 — igual ao original
  transform: Transform;
  cropBox: CropBox;
  history: EditorSnapshot[];
  future: EditorSnapshot[];

  setTool: (tool: Tool) => void;
  setBrushSize: (size: number) => void;
  setTolerance: (t: number) => void;
  setTransform: (t: Partial<Transform>) => void;
  setCropBox: (box: CropBox) => void;
  pushHistory: (snapshot: EditorSnapshot) => void;
  undo: (current: EditorSnapshot) => EditorSnapshot | null;
  redo: (current: EditorSnapshot) => EditorSnapshot | null;
  resetAll: () => void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: "select",
  brushSize: 20,
  tolerance: 32,
  transform: createInitialTransform(),
  cropBox: null,
  history: [],
  future: [],

  setTool: (tool) => set({ tool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setTolerance: (tolerance) => set({ tolerance }),
  setTransform: (t) => set((s) => ({ transform: { ...s.transform, ...t } })),
  setCropBox: (cropBox) => set({ cropBox }),

  pushHistory: (snapshot) =>
    set((s) => ({
      history: [...s.history, snapshot].slice(-MAX_HISTORY),
      future: [],
    })),

  undo: (current) => {
    const { history, future } = get();
    if (history.length === 0) return null;
    const prev = history[history.length - 1];
    set({
      history: history.slice(0, -1),
      future: [current, ...future].slice(0, MAX_HISTORY),
      transform: prev.transform,
      cropBox: prev.cropBox,
    });
    return prev;
  },

  redo: (current) => {
    const { future, history } = get();
    if (future.length === 0) return null;
    const next = future[0];
    set({
      future: future.slice(1),
      history: [...history, current].slice(-MAX_HISTORY),
      transform: next.transform,
      cropBox: next.cropBox,
    });
    return next;
  },

  resetAll: () =>
    set({
      tool: "select",
      transform: createInitialTransform(),
      cropBox: null,
      history: [],
      future: [],
    }),
}));
