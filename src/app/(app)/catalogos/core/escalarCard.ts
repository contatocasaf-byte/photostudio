// Escala um card-molde inteiro por um fator `k` (todas as medidas em px dele:
// posição e tamanho de campos, textos e formas, tamanho de fonte, raios de canto,
// espessura do contorno, largura e altura do card). O reflow usa isso no card de
// DESTAQUE pra ele ocupar sempre a largura útil da página: o card é desenhado
// numa largura qualquer e o reflow o "encaixa" proporcionalmente, sem que o
// resto do desenho (visualização, PDF) precise saber de nada — eles já multiplicam
// tudo pelo `cardScale` da página.
import type { CardLayout, CardShape } from "./cardConfig";
import type { CardTemplateInput } from "./reflow";

// Chaves numéricas, em px, que escalam junto com o card.
const CHAVES_ESCALAVEIS = ["x", "y", "w", "h", "maxW", "fontSize", "raio", "contornoEspessura"] as const;

function escalarCfg<T extends object>(cfg: T, k: number): T {
  const copia = { ...cfg } as Record<string, unknown>;
  for (const chave of CHAVES_ESCALAVEIS) {
    const v = copia[chave];
    if (typeof v === "number") copia[chave] = v * k;
  }
  return copia as T;
}

export function escalarCardTemplate(t: CardTemplateInput, k: number): CardTemplateInput {
  if (k === 1 || !Number.isFinite(k) || k <= 0) return t;

  const layout = {} as CardLayout;
  for (const [chave, cfg] of Object.entries(t.layout)) layout[chave] = escalarCfg(cfg, k);

  const shapes: CardShape[] = t.shapes.map((s) => escalarCfg(s, k));

  return {
    ...t,
    layout,
    shapes,
    largura: t.largura * k,
    alturaMinima: t.alturaMinima * k,
    gutterX: t.gutterX * k,
    gutterY: t.gutterY * k,
    borda: { ...t.borda, espessura: t.borda.espessura * k, raio: t.borda.raio !== undefined ? t.borda.raio * k : undefined },
  };
}
