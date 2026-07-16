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

// Monta as duas camadas de edição, espelhando ItemState do app original:
// `origCanvas` = cor RGB opaca (base da composição e fonte de cor pra
// varinha mágica e pro lápis), `maskCanvas` = o valor de visibilidade
// atual guardado no próprio CANAL ALFA do canvas (RGB fica fixo, sem
// uso) — é isso que `globalCompositeOperation = "destination-in"`
// consulta em `compositeLayers`; lápis usa "source-over" opaco (restaura
// o alfa), borracha usa "destination-out" (zera o alfa).
//
// `originalImg` (opcional) é a foto ANTES da remoção de fundo — quando
// fornecida, é ela que vira `origCanvas`, não a `processedImg`. Isso
// importa de verdade: o rembg zera o RGB onde o alfa é zero, então sem a
// original o lápis "restauraria" revelando essa cor zerada (geralmente
// preto), não o produto de verdade. Se as duas imagens tiverem tamanhos
// diferentes (não deveria, mas por segurança), a original é redesenhada
// no tamanho da processada.
export function splitImageIntoLayers(
  processedImg: HTMLImageElement,
  originalImg?: HTMLImageElement
): {
  origCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
} {
  const w = processedImg.naturalWidth;
  const h = processedImg.naturalHeight;

  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d")!;
  sctx.drawImage(processedImg, 0, 0);
  const srcData = sctx.getImageData(0, 0, w, h).data;

  const origCanvas = document.createElement("canvas");
  origCanvas.width = w;
  origCanvas.height = h;
  const octx = origCanvas.getContext("2d")!;

  if (originalImg) {
    // Cor vem da foto original — sempre opaca, sem relação com o alfa
    // do resultado processado.
    octx.drawImage(originalImg, 0, 0, w, h);
  } else {
    const origData = octx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      origData.data[o] = srcData[o];
      origData.data[o + 1] = srcData[o + 1];
      origData.data[o + 2] = srcData[o + 2];
      origData.data[o + 3] = 255;
    }
    octx.putImageData(origData, 0, 0);
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext("2d")!;
  const maskData = mctx.createImageData(w, h);

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    // O valor da máscara mora no canal ALFA (não no RGB) — é o que a
    // composição via "destination-in" de fato consulta. RGB fica fixo em
    // branco opaco, irrelevante pra composição.
    maskData.data[o] = 255;
    maskData.data[o + 1] = 255;
    maskData.data[o + 2] = 255;
    maskData.data[o + 3] = srcData[o + 3];
  }
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
