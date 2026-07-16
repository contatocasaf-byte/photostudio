// Porta get_opaque_bbox, get_content_center, fit_image_on_canvas
// (core.py:339-620): "cover fit" (preenche a caixa sem distorcer e sem
// cortar o objeto) que ignora a margem transparente e a sombra suave ao
// redor do produto em fotos PNG, centralizando pelo centro de MASSA do
// conteúdo sólido — não pelo centro geométrico do retângulo.
//
// Sem o branch de crop_box manual do original (core.py:541-552): não é
// usado por nenhuma tela desta entrega (só o ajuste de
// rotação/zoom/posição do PhotoAdjustWidget, que usa a detecção
// automática) — não faz sentido portar código morto.

export type BBox = { left: number; top: number; right: number; bottom: number };

export type ProductTransform = {
  rotation?: number; // graus, sentido horário
  zoom?: number; // 1.0 = sem zoom extra
  offsetX?: number; // fração -1..1 da caixa
  offsetY?: number; // fração -1..1 da caixa
};

function computeBBoxAtThreshold(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): BBox | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 };
}

// Threshold padrão (120 de 255) deliberadamente alto: fotos "still" de
// produto costumam ter uma sombra suave (semi-transparente) projetada.
// Se ela contasse como parte do objeto, puxaria o centro calculado pra
// um dos lados. Um threshold alto garante que só o corpo sólido do
// produto (não a sombra) define a área de referência.
export function getOpaqueBBox(imageData: ImageData, alphaThreshold = 120): BBox | null {
  const { data, width, height } = imageData;
  if (alphaThreshold <= 0) return computeBBoxAtThreshold(data, width, height, 0);
  const bbox = computeBBoxAtThreshold(data, width, height, alphaThreshold);
  if (bbox) return bbox;
  // Nenhum pixel "sólido" no threshold alto (objeto inteiramente
  // translúcido) — cai pra um threshold bem mais baixo em vez de tratar
  // a imagem inteira como vazia.
  return computeBBoxAtThreshold(data, width, height, 10);
}

// Centro de massa do conteúdo sólido dentro da bbox, ponderado pela
// opacidade — centraliza pelo peso visual real do objeto (útil em
// silhuetas irregulares), não pelo centro geométrico do retângulo.
export function getContentCenter(imageData: ImageData, bbox: BBox, alphaThreshold = 120): { cx: number; cy: number } {
  const { left, top, right, bottom } = bbox;
  const fallbackCx = (left + right) / 2;
  const fallbackCy = (top + bottom) / 2;

  const rw = right - left;
  const rh = bottom - top;
  if (rw <= 0 || rh <= 0) return { cx: fallbackCx, cy: fallbackCy };

  const { data, width } = imageData;
  const colSum = new Float64Array(rw);
  const rowSum = new Float64Array(rh);

  for (let y = 0; y < rh; y++) {
    const rowBase = (top + y) * width;
    for (let x = 0; x < rw; x++) {
      const a = data[(rowBase + left + x) * 4 + 3];
      if (a > alphaThreshold) {
        colSum[x] += 1;
        rowSum[y] += 1;
      }
    }
  }

  let sumW = 0;
  for (let x = 0; x < rw; x++) sumW += colSum[x];
  if (sumW <= 0) return { cx: fallbackCx, cy: fallbackCy };

  let sumWx = 0;
  for (let x = 0; x < rw; x++) sumWx += colSum[x] * x;
  let sumWRows = 0;
  for (let y = 0; y < rh; y++) sumWRows += rowSum[y];
  let sumWy = 0;
  for (let y = 0; y < rh; y++) sumWy += rowSum[y] * y;

  const cxLocal = sumWx / sumW;
  const cyLocal = sumWRows > 0 ? sumWy / sumWRows : rh / 2;

  return { cx: left + cxLocal, cy: top + cyLocal };
}

// Rotaciona (sentido horário pra `rotationDeg` positivo — igual à
// convenção do resto do app) numa tela nova, do tamanho exato pra caber
// o conteúdo rotacionado sem cortar cantos (equivalente a
// img.rotate(-angle, expand=True) do PIL; Canvas já rotaciona em
// sentido horário pra ângulo positivo, sem precisar inverter o sinal).
function rotateToCanvas(source: HTMLCanvasElement, rotationDeg: number): HTMLCanvasElement {
  if (!rotationDeg) return source;
  const rad = (rotationDeg * Math.PI) / 180;
  const w = source.width;
  const h = source.height;
  const newW = Math.max(1, Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))));
  const newH = Math.max(1, Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))));

  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -w / 2, -h / 2);
  return canvas;
}

// Cache da etapa cara (ROI) por (canvas de origem, rotação) — só a
// última entrada, suficiente pro caso de uso real (um widget de ajuste
// editando UMA foto por vez, chamando fitImageOnCanvas repetidamente
// durante um arraste, onde só zoom/offset mudam quadro a quadro). Sem
// isso, cada movimento de mouse re-escanearia todos os pixels da foto
// pra achar bbox/centro de novo — trava a UI em fotos grandes.
let roiCache: { source: HTMLCanvasElement; rotation: number; roi: HTMLCanvasElement } | null = null;

// Etapa cara: rotação + região de interesse (ROI) simétrica em torno do
// centro de massa do objeto sólido.
function computeRoi(productCanvas: HTMLCanvasElement, rotation: number): HTMLCanvasElement {
  if (roiCache && roiCache.source === productCanvas && roiCache.rotation === rotation) {
    return roiCache.roi;
  }
  const roi = computeRoiUncached(productCanvas, rotation);
  roiCache = { source: productCanvas, rotation, roi };
  return roi;
}

function computeRoiUncached(productCanvas: HTMLCanvasElement, rotation: number): HTMLCanvasElement {
  const outCanvas = rotateToCanvas(productCanvas, rotation);
  const ctx = outCanvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
  const bbox = getOpaqueBBox(imageData);
  if (!bbox) return outCanvas;

  const { cx, cy } = getContentCenter(imageData, bbox);
  const { left: leftB, top: topB, right: rightB, bottom: bottomB } = bbox;
  const halfW = Math.max(cx - leftB, rightB - cx);
  const halfH = Math.max(cy - topB, bottomB - cy);

  const symLeft = Math.max(0, cx - halfW);
  const symTop = Math.max(0, cy - halfH);
  const symRight = Math.min(outCanvas.width, cx + halfW);
  const symBottom = Math.min(outCanvas.height, cy + halfH);

  const rLeft = Math.round(symLeft);
  const rTop = Math.round(symTop);
  const rw = Math.max(1, Math.round(symRight) - rLeft);
  const rh = Math.max(1, Math.round(symBottom) - rTop);

  const roi = document.createElement("canvas");
  roi.width = rw;
  roi.height = rh;
  roi.getContext("2d")!.drawImage(outCanvas, rLeft, rTop, rw, rh, 0, 0, rw, rh);
  return roi;
}

// Redimensiona e recorta a foto do produto pra preencher COMPLETAMENTE
// a caixa (boxW x boxH), sem distorcer a proporção (equivalente a
// "object-fit: cover") e sem cortar o objeto principal — a escala
// "cover" é calculada sobre a bounding box do conteúdo opaco, não sobre
// o retângulo inteiro do arquivo, senão o corte poderia invadir o
// objeto enquanto ainda sobra transparência nas bordas.
export function fitImageOnCanvas(
  productCanvas: HTMLCanvasElement,
  boxW: number,
  boxH: number,
  transform: ProductTransform = {}
): HTMLCanvasElement {
  const rotation = transform.rotation ?? 0;

  let source = computeRoi(productCanvas, rotation);
  let rw = source.width;
  let rh = source.height;
  if (rw === 0 || rh === 0) {
    source = productCanvas;
    rw = source.width;
    rh = source.height;
  }
  if (rw === 0 || rh === 0) {
    const empty = document.createElement("canvas");
    empty.width = Math.max(1, boxW);
    empty.height = Math.max(1, boxH);
    return empty;
  }

  const baseScale = Math.max(boxW / rw, boxH / rh);
  const zoom = Math.max(0.1, transform.zoom ?? 1.0);
  const scale = baseScale * zoom;

  const nw = Math.max(1, Math.round(rw * scale));
  const nh = Math.max(1, Math.round(rh * scale));

  const offsetXFrac = transform.offsetX ?? 0;
  const offsetYFrac = transform.offsetY ?? 0;

  const overflowW = nw - boxW; // >0: sobra pra cortar; <=0: sobra espaço vazio
  const overflowH = nh - boxH;

  const idealLeft = overflowW / 2 - offsetXFrac * boxW;
  const idealTop = overflowH / 2 - offsetYFrac * boxH;

  let left: number;
  if (overflowW > 0) {
    left = Math.max(0, Math.min(idealLeft, overflowW));
  } else {
    const margin = -overflowW / 2;
    left = Math.max(-margin, Math.min(idealLeft, margin));
  }

  let top: number;
  if (overflowH > 0) {
    top = Math.max(0, Math.min(idealTop, overflowH));
  } else {
    const margin = -overflowH / 2;
    top = Math.max(-margin, Math.min(idealTop, margin));
  }

  left = Math.round(left);
  top = Math.round(top);

  const out = document.createElement("canvas");
  out.width = Math.max(1, boxW);
  out.height = Math.max(1, boxH);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, rw, rh, -left, -top, nw, nh);

  return out;
}

export function loadImageToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
