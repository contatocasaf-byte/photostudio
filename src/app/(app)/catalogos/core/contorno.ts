// CONTORNO (traço) de formas e textos do card: cor, transparência, espessura e,
// nas formas, estilo da linha (sólido / tracejado / pontilhado).
//
// Guardado em campos planos opcionais no próprio elemento (nada de coluna nova no
// banco, e card salvo antes disto — sem nenhum desses campos — continua igual):
//   contornoEspessura  px do card; > 0 liga o contorno (ausente/0 = sem contorno)
//   contornoCor        "#rrggbb" (padrão preto)
//   contornoOpacidade  0-1 (padrão 1)
//   contornoEstilo     "solido" | "tracejado" | "pontilhado" (só formas)
//
// Forma: o traço fica centrado na borda (metade pra dentro, metade pra fora).
// Texto: o traço é desenhado ATRÁS das letras, então a espessura é a que aparece
// por fora delas. O backend do PDF (pdf_logic.py) desenha igual.
export type EstiloContorno = "solido" | "tracejado" | "pontilhado";

export type ContornoCampos = {
  contornoCor?: string;
  contornoOpacidade?: number;
  contornoEspessura?: number;
  contornoEstilo?: EstiloContorno;
};

export const CONTORNO_COR_PADRAO = "#000000";
export const CONTORNO_ESPESSURA_PADRAO = 2;

export function contornoAtivo(c: ContornoCampos): boolean {
  return (c.contornoEspessura ?? 0) > 0;
}

export type ContornoResolvido = { cor: string; opacidade: number; espessura: number; estilo: EstiloContorno };

// Contorno pronto pra desenhar, com a espessura multiplicada por `k` (escala em
// que o elemento está sendo desenhado). null = sem contorno.
export function contornoResolvido(c: ContornoCampos, k = 1): ContornoResolvido | null {
  if (!contornoAtivo(c)) return null;
  return {
    cor: c.contornoCor ?? CONTORNO_COR_PADRAO,
    opacidade: c.contornoOpacidade ?? 1,
    espessura: (c.contornoEspessura as number) * k,
    estilo: c.contornoEstilo ?? "solido",
  };
}

// Padrão de traço (px) do Canvas/Konva. O pontilhado usa pontos de comprimento
// ~0 com pontas redondas (lineCap "round"), o que desenha círculos.
export function tracoDoEstilo(estilo: EstiloContorno, espessura: number): number[] | undefined {
  if (estilo === "tracejado") return [espessura * 3, espessura * 2];
  if (estilo === "pontilhado") return [0.001, espessura * 2];
  return undefined;
}

// Folga (px do canvas) que o desenho de um texto com contorno precisa em volta da
// caixa dele, pra o traço não ser cortado nas bordas do bitmap. 0 sem contorno.
export function margemContornoTexto(c: ContornoCampos, k = 1): number {
  const ct = contornoResolvido(c, k);
  return ct ? Math.ceil(ct.espessura) : 0;
}

// Campos do contorno no formato do payload do PDF (px de página).
export function contornoParaPdf(c: ContornoCampos, k: number) {
  const ct = contornoResolvido(c, k);
  return ct
    ? { contornoCor: ct.cor, contornoOpacidade: ct.opacidade, contornoEspessura: ct.espessura, contornoEstilo: ct.estilo }
    : {};
}
