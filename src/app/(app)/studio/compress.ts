import { loadImage } from "./editor/canvasUtils";

const TARGET_MIN_KB = 80;
const TARGET_MAX_KB = 120;
const MAX_ITER = 10;
const JPEG_QUALITY = 0.85;

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar JPEG."))), "image/jpeg", quality);
  });
}

// Porta de _comprimir_para_pendente (removedor_fundo.py:2434-2457): compõe
// fundo branco (JPEG não tem canal alfa) e reduz a resolução iterativamente
// até a faixa de 80-120KB — leve o bastante pra site/rede social, sem
// perder qualidade visível a mais do que precisa. Até 10 tentativas;
// devolve o resultado da última tentativa mesmo se não encaixar exato.
export async function compressImage(img: HTMLImageElement): Promise<Blob> {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;

  let scale = 0.4;
  let lastBlob: Blob | null = null;

  for (let i = 0; i < MAX_ITER; i++) {
    const nw = Math.max(1, Math.round(w0 * scale));
    const nh = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, nw, nh);
    ctx.drawImage(img, 0, 0, nw, nh);

    const blob = await canvasToJpegBlob(canvas, JPEG_QUALITY);
    lastBlob = blob;
    const kb = blob.size / 1024;
    if (kb >= TARGET_MIN_KB && kb <= TARGET_MAX_KB) break;
    scale = kb < TARGET_MIN_KB ? Math.min(scale * 1.25, 1) : scale * 0.8;
  }

  return lastBlob!;
}

export async function compressImageFromUrl(url: string): Promise<Blob> {
  const img = await loadImage(url);
  return compressImage(img);
}
