// Lógica genérica de texto em Canvas 2D: encolhe a fonte até caber em
// N linhas de largura máxima, quebra linha, alinha (left/center/
// right/justify). Extraído de ofertas/core/renderOffer.ts (Porta de
// _wrap_text_to_lines/draw_text_fit, core.py:641-766) pra ser
// compartilhado com o Criador de Catálogos, que precisa exatamente da
// mesma coisa pros campos de texto do card-molde — nada aqui é
// específico de oferta.

export type TextAlign = "left" | "center" | "right" | "justify";

// Fallback genérico ao final da pilha de fontes — se a família
// configurada ainda não tiver terminado de carregar por algum motivo,
// o Canvas cai numa fonte parecida em vez de travar/ficar em branco.
function fontStack(family: string): string {
  return `"${family}", Arial, sans-serif`;
}

function setFont(ctx: CanvasRenderingContext2D, weight: "bold" | "normal", size: number, family: string) {
  ctx.font = `${weight === "bold" ? "bold " : ""}${size}px ${fontStack(family)}`;
}

export function wrapTextToLines(
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
export function drawTextFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
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
    setFont(ctx, fontWeight, size, fontFamily);
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
    setFont(ctx, fontWeight, minSize, fontFamily);
    lines = wrapTextToLines(ctx, text, maxW, maxLines, true).lines;
  }

  setFont(ctx, fontWeight, usedSize, fontFamily);
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
