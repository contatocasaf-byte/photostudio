import type { CropBox, Transform } from "./EditorStore";

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Separa a foto processada (já sem fundo, vinda do R2) em duas camadas,
// espelhando ItemState do app original: `origCanvas` = cor RGB opaca
// (usada como base da composição e como fonte de cor pra varinha mágica),
// `maskCanvas` = alfa atual em escala de cinza (lápis pinta 255, borracha
// pinta 0). Nota: diferente do original, aqui não temos a foto ANTES do
// rembg — então "restaurar" com o lápis numa área que já estava com alfa
// zero revela a cor que o rembg deixou ali (que pode ser preto), não a
// cor real do produto. Isso cobre bem o caso mais comum (apagar resíduo
// de fundo que ainda está opaco); ver PROJECT_STATUS se isso incomodar na
// prática.
export function splitImageIntoLayers(img: HTMLImageElement): {
  origCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
} {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d")!;
  sctx.drawImage(img, 0, 0);
  const srcData = sctx.getImageData(0, 0, w, h).data;

  const origCanvas = document.createElement("canvas");
  origCanvas.width = w;
  origCanvas.height = h;
  const octx = origCanvas.getContext("2d")!;
  const origData = octx.createImageData(w, h);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext("2d")!;
  const maskData = mctx.createImageData(w, h);

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    origData.data[o] = srcData[o];
    origData.data[o + 1] = srcData[o + 1];
    origData.data[o + 2] = srcData[o + 2];
    origData.data[o + 3] = 255;

    const a = srcData[o + 3];
    maskData.data[o] = a;
    maskData.data[o + 1] = a;
    maskData.data[o + 2] = a;
    maskData.data[o + 3] = 255;
  }

  octx.putImageData(origData, 0, 0);
  mctx.putImageData(maskData, 0, 0);

  return { origCanvas, maskCanvas };
}

// Mescla o RGB original com a máscara como canal alfa — equivalente a
// ItemState.composed() (removedor_fundo.py:422-433).
export function compositeLayers(origCanvas: HTMLCanvasElement, maskCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = origCanvas.width;
  out.height = origCanvas.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(origCanvas, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return out;
}

export function cloneCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext("2d")!.drawImage(canvas, 0, 0);
  return out;
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Composição final pra exportar: recorte (se houver) + rotação + escala,
// centralizado num canvas transparente CANVAS_OUT×CANVAS_OUT — mesma
// ideia de ItemState.export() (removedor_fundo.py:442-463), só que a
// direção/convenção de rotação segue o Konva (sentido horário), não o
// PIL.
export function exportFinal(
  origCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  transform: Transform,
  cropBox: CropBox,
  outSize = 1000
): HTMLCanvasElement {
  const composed = compositeLayers(origCanvas, maskCanvas);

  let source: HTMLCanvasElement = composed;
  if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
    const cropped = document.createElement("canvas");
    cropped.width = cropBox.width;
    cropped.height = cropBox.height;
    cropped
      .getContext("2d")!
      .drawImage(composed, cropBox.x, cropBox.y, cropBox.width, cropBox.height, 0, 0, cropBox.width, cropBox.height);
    source = cropped;
  }

  const rad = (transform.rotation * Math.PI) / 180;
  const sw = source.width * transform.scaleX;
  const sh = source.height * transform.scaleY;
  const rotatedW = Math.ceil(Math.abs(sw * Math.cos(rad)) + Math.abs(sh * Math.sin(rad)));
  const rotatedH = Math.ceil(Math.abs(sw * Math.sin(rad)) + Math.abs(sh * Math.cos(rad)));

  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = Math.max(1, rotatedW);
  rotatedCanvas.height = Math.max(1, rotatedH);
  const rctx = rotatedCanvas.getContext("2d")!;
  rctx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  rctx.rotate(rad);
  rctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);

  const out = document.createElement("canvas");
  out.width = outSize;
  out.height = outSize;
  out
    .getContext("2d")!
    .drawImage(rotatedCanvas, (outSize - rotatedCanvas.width) / 2, (outSize - rotatedCanvas.height) / 2);

  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Falha ao gerar PNG."));
    }, "image/png");
  });
}
