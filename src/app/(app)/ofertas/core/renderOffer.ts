// Porta _wrap_text_to_lines, draw_text_fit, render_canvas (core.py:641-817)
// pra Canvas 2D. `safe_font` do original (tenta carregar um .ttf, cai
// pra Arial/DejaVu) não tem equivalente aqui: sem biblioteca de fontes
// ainda (Fase 4), o navegador já resolve a fonte do sistema via
// font-family CSS — só precisa saber se é bold ou normal.
import {
  type ElementKey,
  type ImageElementConfig,
  type LayoutConfig,
  type TextAlign,
  type TextElementConfig,
  substitutePlaceholders,
} from "./layoutConfig";
import { fitImageOnCanvas, type ProductTransform } from "./fitImageOnCanvas";
import { formatarPrecoBR } from "./priceFormat";

const FONT_FAMILY = "Arial, sans-serif";

function setFont(ctx: CanvasRenderingContext2D, weight: "bold" | "normal", size: number) {
  ctx.font = `${weight === "bold" ? "bold " : ""}${size}px ${FONT_FAMILY}`;
}

function wrapTextToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
  allowTruncate: boolean
): { lines: string[]; overflow: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [text], overflow: false };

  const lines: string[] = [];
  let current = "";
  let brokeEarly = false;

  for (const word of words) {
    const trial = (current + " " + word).trim();
    const fits = ctx.measureText(trial).width <= maxW;
    if (fits || !current) {
      current = trial;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        brokeEarly = true;
        break;
      }
    }
  }
  if (!brokeEarly && current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;

  const usedWords = lines.reduce((sum, l) => sum + l.split(/\s+/).filter(Boolean).length, 0);
  const overflow = usedWords < words.length;

  if (overflow && allowTruncate && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (true) {
      const fits = ctx.measureText(last + "…").width <= maxW;
      if (fits || last.length <= 1) break;
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = last + "…";
  }

  return { lines: lines.length ? lines : [text], overflow };
}

// Desenha texto respeitando font_size_max (reduzido até caber em
// max_lines linhas de max_w, só truncando com reticências se nem no
// tamanho mínimo couber) e alinhamento left/center/right/justify.
// Exportado — o Editor de Layout (Fase 4a) reaproveita pra renderizar
// uma prévia WYSIWYG de verdade, não uma estimativa de caixa.
export function drawTextFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontWeight: "bold" | "normal",
  fontSizeMax: number,
  maxW: number,
  x: number,
  y: number,
  fill: string,
  align: TextAlign,
  maxLines: number,
  lineSpacing = 1.15
) {
  const minSize = 8;
  let lines = [text];
  let usedSize = minSize;
  let found = false;

  for (let size = fontSizeMax; size > minSize; size--) {
    setFont(ctx, fontWeight, size);
    const result = wrapTextToLines(ctx, text, maxW, maxLines, false);
    const fits = result.lines.every((ln) => ctx.measureText(ln).width <= maxW);
    if (fits && !result.overflow) {
      lines = result.lines;
      usedSize = size;
      found = true;
      break;
    }
  }
  if (!found) {
    usedSize = minSize;
    setFont(ctx, fontWeight, minSize);
    lines = wrapTextToLines(ctx, text, maxW, maxLines, true).lines;
  }

  setFont(ctx, fontWeight, usedSize);
  const metrics = ctx.measureText("Ag");
  const ascent = metrics.actualBoundingBoxAscent || usedSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || usedSize * 0.2;
  const lineH = (ascent + descent) * lineSpacing;

  ctx.fillStyle = fill;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  lines.forEach((line, i) => {
    const lineW = ctx.measureText(line).width;
    const baselineY = y + i * lineH + ascent;

    if (align === "center") {
      ctx.fillText(line, x + (maxW - lineW) / 2, baselineY);
    } else if (align === "right") {
      ctx.fillText(line, x + (maxW - lineW), baselineY);
    } else if (align === "justify" && i < lines.length - 1 && line.trim().includes(" ")) {
      const words = line.split(" ");
      const wordsW = words.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
      const gapCount = Math.max(1, words.length - 1);
      const spaceW = ctx.measureText(" ").width;
      const extraSpace = Math.max(0, maxW - wordsW) / gapCount;
      let cursorX = x;
      for (const w of words) {
        ctx.fillText(w, cursorX, baselineY);
        cursorX += ctx.measureText(w).width + spaceW + extraSpace;
      }
    } else {
      ctx.fillText(line, x, baselineY);
    }
  });
}

export type RenderOfferParams = {
  layoutImg: HTMLImageElement;
  cfg: LayoutConfig;
  productCanvas: HTMLCanvasElement | null;
  ref: string;
  desc: string;
  precoSp: string;
  precoPa: string;
  dataIni: string; // já formatado, ex: "01/01/2026"
  dataFim: string;
  mostrarPrecos: boolean;
  productTransform?: ProductTransform;
};

// Monta a imagem final a partir da configuração do layout. As dimensões
// do arquivo de layout são sempre preservadas (sem esticar/encolher) —
// o canvas nasce do tamanho exato de `layoutImg`.
export function renderOffer(params: RenderOfferParams): HTMLCanvasElement {
  const { layoutImg, cfg, productCanvas, ref, desc, precoSp, precoPa, dataIni, dataFim, mostrarPrecos, productTransform } =
    params;

  const canvas = document.createElement("canvas");
  canvas.width = layoutImg.naturalWidth;
  canvas.height = layoutImg.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  // Fundo branco antes do layout — só por segurança caso o PNG do
  // layout tenha alguma transparência residual (JPEG final não tem
  // canal alfa; sem isso, área transparente viraria preto na exportação).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(layoutImg, 0, 0);

  if (productCanvas) {
    const pb = cfg.product_box as ImageElementConfig;
    const prodFit = fitImageOnCanvas(productCanvas, pb.w, pb.h, productTransform);
    ctx.drawImage(prodFit, pb.x, pb.y);
  }

  // Valores disponíveis pra substituir nos templates editáveis de cada
  // elemento (ver layoutConfig.ts, ELEMENT_PLACEHOLDERS) — troca o
  // "Preço SP"/"R$ 99,90" hardcoded do app original por texto
  // configurável por layout.
  const values: Record<string, string> = {
    ref,
    desc,
    preco_sp: formatarPrecoBR(precoSp),
    preco_pa: formatarPrecoBR(precoPa),
    data_ini: dataIni,
    data_fim: dataFim,
  };

  const keysToRender: ElementKey[] = mostrarPrecos
    ? ["ref_pos", "desc_pos", "label_sp_pos", "price_sp_pos", "label_pa_pos", "price_pa_pos", "validity_pos"]
    : ["ref_pos", "desc_pos"];

  for (const key of keysToRender) {
    const c = cfg[key] as TextElementConfig;
    const text = substitutePlaceholders(c.text ?? "", values);
    drawTextFit(
      ctx,
      text,
      c.fontWeight ?? "normal",
      c.fontSize ?? 24,
      c.maxW ?? 500,
      c.x ?? 0,
      c.y ?? 0,
      c.color ?? "#FFFFFF",
      c.align ?? "left",
      c.maxLines ?? 1
    );
  }

  return canvas;
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar JPEG."))), "image/jpeg", quality);
  });
}
