// Preço no estilo "etiqueta de oferta": o valor inteiro grande, com o "R$" e os
// centavos menores, alinhados pelo TOPO ao lado dele (ex.: R$ 16,50 -> "R$" e
// ",50" pequenos no alto, "16" grande). Texto antes/depois do preço (ex.:
// "Preço SP:") sai pequeno, também no alto.
//
// O cálculo de posição é uma conta pura (layoutPreco) — o backend do PDF tem o
// espelho exato em pdf_logic.py (layout_preco_destacado). Se mudar aqui, mude
// lá: editor, visualização e PDF precisam desenhar igual.
import { escreverTexto, setFont, type ContornoTexto } from "./canvasText";

// Tamanhos relativos ao do valor inteiro (que é o "Tamanho da fonte" do campo).
export const ESC_SIMBOLO = 0.33;
export const ESC_CENTAVOS = 0.47;
export const ESC_TEXTO = 0.47;
// Espaços (relativos ao tamanho do valor inteiro) entre as partes.
const FOLGA_SIMBOLO = 0.04;
const FOLGA_CENTAVOS = 0.02;
const FOLGA_TEXTO = 0.1;

export type PartesPreco = { prefixo: string; inteiro: string; centavos: string; sufixo: string };

// Procura "R$ 1.234,56" no texto já montado. Sem preço no texto devolve null
// (o chamador desenha o texto normal).
export function separarPreco(texto: string): PartesPreco | null {
  const m = /^([\s\S]*?)R\$\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})([\s\S]*)$/.exec(texto);
  if (!m) return null;
  return { prefixo: m[1].trim(), inteiro: m[2], centavos: "," + m[3], sufixo: m[4].trim() };
}

export type ParteDesenhada = { texto: string; tamanho: number; x: number; baselineY: number };

type Parte = { texto: string; tam: number; folga: number };

function montarPartes(p: PartesPreco, s: number): Parte[] {
  const out: Parte[] = [];
  if (p.prefixo) out.push({ texto: p.prefixo, tam: s * ESC_TEXTO, folga: s * FOLGA_TEXTO });
  out.push({ texto: "R$", tam: s * ESC_SIMBOLO, folga: s * FOLGA_SIMBOLO });
  out.push({ texto: p.inteiro, tam: s, folga: s * FOLGA_CENTAVOS });
  out.push({ texto: p.centavos, tam: s * ESC_CENTAVOS, folga: p.sufixo ? s * FOLGA_TEXTO : 0 });
  if (p.sufixo) out.push({ texto: p.sufixo, tam: s * ESC_TEXTO, folga: 0 });
  return out;
}

// Maior tamanho (do valor inteiro, em passos de 1, até o piso) em que o preço
// inteiro cabe em `maxW`; as partes saem alinhadas pelo topo em `y`.
export function layoutPreco(
  p: PartesPreco,
  opts: { tamanhoMax: number; piso: number; maxW: number; x: number; y: number; align: "left" | "center" | "right" | "justify" },
  medir: (texto: string, tamanho: number) => number,
  ascent: (tamanho: number) => number
): ParteDesenhada[] {
  const larguraTotal = (s: number) => montarPartes(p, s).reduce((acc, parte) => acc + medir(parte.texto, parte.tam) + parte.folga, 0);

  const piso = Math.min(opts.piso, opts.tamanhoMax);
  let usado = piso;
  for (let s = opts.tamanhoMax; s >= piso; s--) {
    if (larguraTotal(s) <= opts.maxW) {
      usado = s;
      break;
    }
  }

  const w = larguraTotal(usado);
  let cursor = opts.x;
  if (opts.align === "center") cursor = opts.x + (opts.maxW - w) / 2;
  else if (opts.align === "right") cursor = opts.x + (opts.maxW - w);

  const out: ParteDesenhada[] = [];
  for (const parte of montarPartes(p, usado)) {
    out.push({ texto: parte.texto, tamanho: parte.tam, x: cursor, baselineY: opts.y + ascent(parte.tam) });
    cursor += medir(parte.texto, parte.tam) + parte.folga;
  }
  return out;
}

// Desenha no Canvas 2D. Devolve false (sem desenhar nada) se o texto não tem
// um preço "R$ x,xx" — aí o chamador usa o desenho de texto normal.
export function desenharPrecoDestacado(
  ctx: CanvasRenderingContext2D,
  texto: string,
  fontFamily: string,
  fontWeight: "bold" | "normal",
  tamanhoMax: number,
  maxW: number,
  x: number,
  y: number,
  fill: string,
  align: "left" | "center" | "right" | "justify",
  piso = 8,
  contorno?: ContornoTexto
): boolean {
  const partes = separarPreco(texto);
  if (!partes) return false;

  const medir = (t: string, tam: number) => {
    setFont(ctx, fontWeight, tam, fontFamily);
    return ctx.measureText(t).width;
  };
  const ascent = (tam: number) => {
    setFont(ctx, fontWeight, tam, fontFamily);
    return ctx.measureText("Ag").actualBoundingBoxAscent || tam * 0.8;
  };

  const ops = layoutPreco(partes, { tamanhoMax, piso, maxW, x, y, align }, medir, ascent);
  ctx.fillStyle = fill;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const op of ops) {
    setFont(ctx, fontWeight, op.tamanho, fontFamily);
    escreverTexto(ctx, op.texto, op.x, op.baselineY, contorno);
  }
  return true;
}
