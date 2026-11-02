// Elementos LIVRES do card-molde (textos adicionados à mão e formas), mais as
// operações de AGRUPAR, DESAGRUPAR e DUPLICAR sobre a seleção. Tudo em funções
// puras (estado entra, estado novo sai) — o editor só liga isso nos botões.
//
// Onde fica cada coisa (nada disto precisa de coluna nova no banco):
//   - campos fixos (foto, código, ref...): layout[<chave>]            — já existiam
//   - formas:                              shapes[]                    — já existiam
//   - textos livres:                       layout["texto:<id>"]        — NOVO, dentro do
//                                          mesmo layout_json dos campos
//   - grupo: campo opcional `grupo` (id do grupo) em qualquer um dos três.
//     Grupo é só um vínculo de seleção/movimento no editor: não muda como o
//     card é desenhado na visualização nem no PDF.
import type { CardLayout, CardShape, CardTextElementConfig } from "./cardConfig";

export const PREFIXO_TEXTO = "texto:";
export const chaveTexto = (id: string) => PREFIXO_TEXTO + id;

export type CardTexto = CardTextElementConfig & { id: string };

// Textos livres do card, na ordem em que foram criados (ordem = empilhamento:
// o último fica por cima).
export function listarTextos(layout: CardLayout): CardTexto[] {
  return Object.entries(layout)
    .filter(([k]) => k.startsWith(PREFIXO_TEXTO))
    .map(([k, cfg]) => ({ ...(cfg as CardTextElementConfig), id: k.slice(PREFIXO_TEXTO.length) }));
}

// Altura "automática" da caixa de um texto: todas as linhas permitidas x 1,6 x
// o tamanho da fonte. É a de sempre (cards salvos sem `h` continuam iguais).
export function alturaAutomaticaTexto(cfg: Pick<CardTextElementConfig, "maxLines" | "fontSize">): number {
  return Math.max(1, Math.ceil(cfg.maxLines * cfg.fontSize * 1.6));
}

// Altura da caixa de um texto no editor: a escolhida (`h`) ou a automática.
export function alturaCaixaTexto(cfg: Pick<CardTextElementConfig, "maxLines" | "fontSize" | "h">): number {
  return typeof cfg.h === "number" && cfg.h > 0 ? Math.max(1, Math.round(cfg.h)) : alturaAutomaticaTexto(cfg);
}

// Largura e altura (px do card) de qualquer elemento do card — foto/forma
// (w x h) ou texto (largura máxima x altura da caixa). Usado pra centralizar.
export function tamanhoDoElemento(cfg: Partial<CardTextElementConfig & { w: number }>): { w: number; h: number } {
  if (typeof cfg.maxW === "number" && typeof cfg.fontSize === "number") {
    return { w: cfg.maxW, h: alturaCaixaTexto({ maxLines: cfg.maxLines ?? 1, fontSize: cfg.fontSize, h: cfg.h }) };
  }
  return { w: cfg.w ?? 0, h: cfg.h ?? 0 };
}

// Só os textos ligados (sem `oculto`) — o que o editor desenha, a visualização
// mostra e o PDF imprime.
export function listarTextosVisiveis(layout: CardLayout): CardTexto[] {
  return listarTextos(layout).filter((t) => !t.oculto);
}

export function defaultCardTexto(): CardTextElementConfig {
  return {
    x: 20,
    y: 20,
    text: "Texto",
    fontSize: 16,
    maxW: 160,
    color: "#1a1a1a",
    fontFamily: "Arial",
    fontWeight: "bold",
    align: "left",
    maxLines: 2,
  };
}

export type EstadoElementos = { layout: CardLayout; shapes: CardShape[] };
// `campos`: chaves de campos fixos no layout (foto, codigo...). `livres`: ids de
// formas e de textos livres.
export type Selecao = { campos: string[]; livres: string[] };

type ComGrupo = { grupo?: string };

function grupoDoCampo(e: EstadoElementos, chave: string): string | undefined {
  return (e.layout[chave] as ComGrupo | undefined)?.grupo;
}

function grupoDoLivre(e: EstadoElementos, id: string): string | undefined {
  const forma = e.shapes.find((s) => s.id === id);
  if (forma) return forma.grupo;
  return (e.layout[chaveTexto(id)] as ComGrupo | undefined)?.grupo;
}

function ehLivre(e: EstadoElementos, id: string): boolean {
  return e.shapes.some((s) => s.id === id) || chaveTexto(id) in e.layout;
}

export function gruposDaSelecao(e: EstadoElementos, s: Selecao): Set<string> {
  const out = new Set<string>();
  for (const c of s.campos) {
    const g = grupoDoCampo(e, c);
    if (g) out.add(g);
  }
  for (const id of s.livres) {
    const g = grupoDoLivre(e, id);
    if (g) out.add(g);
  }
  return out;
}

// Todos os elementos de um grupo. `camposHabilitados` filtra campos fixos
// desligados (não aparecem no card, não devem entrar na seleção).
export function membrosDoGrupo(e: EstadoElementos, grupo: string, camposHabilitados: string[]): Selecao {
  const campos = camposHabilitados.filter((c) => grupoDoCampo(e, c) === grupo);
  const livres = [
    ...e.shapes.filter((f) => f.grupo === grupo).map((f) => f.id),
    ...Object.keys(e.layout)
      .filter((k) => k.startsWith(PREFIXO_TEXTO) && (e.layout[k] as ComGrupo).grupo === grupo)
      .map((k) => k.slice(PREFIXO_TEXTO.length)),
  ];
  return { campos, livres };
}

const unico = (xs: string[]) => [...new Set(xs)];

// Seleção + todos os membros dos grupos tocados por ela.
export function expandirPorGrupo(e: EstadoElementos, s: Selecao, camposHabilitados: string[]): Selecao {
  let campos = [...s.campos];
  let livres = [...s.livres];
  for (const g of gruposDaSelecao(e, s)) {
    const m = membrosDoGrupo(e, g, camposHabilitados);
    campos = campos.concat(m.campos);
    livres = livres.concat(m.livres);
  }
  return { campos: unico(campos), livres: unico(livres) };
}

function comGrupo(e: EstadoElementos, s: Selecao, grupo: string | undefined): EstadoElementos {
  const layout = { ...e.layout } as Record<string, unknown>;
  const aplicar = (chave: string) => {
    const atual = layout[chave] as ComGrupo | undefined;
    if (!atual) return;
    const novo = { ...atual };
    if (grupo) novo.grupo = grupo;
    else delete novo.grupo;
    layout[chave] = novo;
  };
  for (const c of s.campos) aplicar(c);
  for (const id of s.livres) if (chaveTexto(id) in layout) aplicar(chaveTexto(id));

  const shapes = e.shapes.map((f) => {
    if (!s.livres.includes(f.id)) return f;
    const novo = { ...f };
    if (grupo) novo.grupo = grupo;
    else delete novo.grupo;
    return novo;
  });
  return { layout: layout as CardLayout, shapes };
}

// Grupo com menos de 2 membros não existe: desfaz o vínculo do que sobrou.
export function limparGruposOrfaos(e: EstadoElementos): EstadoElementos {
  const contagem = new Map<string, number>();
  const contar = (g: string | undefined) => {
    if (g) contagem.set(g, (contagem.get(g) ?? 0) + 1);
  };
  for (const v of Object.values(e.layout)) contar((v as ComGrupo | undefined)?.grupo);
  for (const f of e.shapes) contar(f.grupo);

  const orfaos = [...contagem.entries()].filter(([, n]) => n < 2).map(([g]) => g);
  if (orfaos.length === 0) return e;
  let resultado = e;
  for (const g of orfaos) {
    const m = { campos: Object.keys(resultado.layout).filter((k) => grupoDoCampo(resultado, k) === g), livres: [] as string[] };
    const livres = [
      ...resultado.shapes.filter((f) => f.grupo === g).map((f) => f.id),
    ];
    // textos livres moram no layout: já estão em `campos` acima (chave "texto:...")
    resultado = comGrupo(resultado, { campos: m.campos, livres }, undefined);
  }
  return resultado;
}

// Agrupa a seleção (precisa de 2 ou mais elementos). Quem já estava em outro
// grupo passa pro novo; o grupo antigo que ficar com 1 só membro é desfeito.
export function agrupar(e: EstadoElementos, s: Selecao, novoGrupoId: string): EstadoElementos {
  if (s.campos.length + s.livres.length < 2) return e;
  return limparGruposOrfaos(comGrupo(e, s, novoGrupoId));
}

// Desfaz todos os grupos que a seleção toca (todos os membros ficam soltos).
export function desagrupar(e: EstadoElementos, s: Selecao, camposHabilitados: string[]): EstadoElementos {
  const grupos = gruposDaSelecao(e, s);
  if (grupos.size === 0) return e;
  let todos: Selecao = { campos: [], livres: [] };
  for (const g of grupos) {
    const m = membrosDoGrupo(e, g, Object.keys(e.layout));
    todos = { campos: todos.campos.concat(m.campos), livres: todos.livres.concat(m.livres) };
  }
  void camposHabilitados;
  return comGrupo(e, { campos: unico(todos.campos), livres: unico(todos.livres) }, undefined);
}

// Duplica as formas e textos livres da seleção (deslocados `delta` px). Campos
// fixos (foto, código, ref...) existem uma vez só no card e são ignorados —
// `ignorados` diz quantos. Se vários elementos de um mesmo grupo são duplicados,
// as cópias formam um grupo novo (o original não é afetado).
export function duplicar(
  e: EstadoElementos,
  s: Selecao,
  gerarId: () => string,
  delta = 12
): { estado: EstadoElementos; novos: string[]; ignorados: number } {
  const ids = s.livres.filter((id) => ehLivre(e, id));
  const contagemGrupo = new Map<string, number>();
  for (const id of ids) {
    const g = grupoDoLivre(e, id);
    if (g) contagemGrupo.set(g, (contagemGrupo.get(g) ?? 0) + 1);
  }
  const novoGrupo = new Map<string, string>();
  for (const [g, n] of contagemGrupo) if (n >= 2) novoGrupo.set(g, gerarId());

  const layout = { ...e.layout } as Record<string, unknown>;
  const shapes = [...e.shapes];
  const novos: string[] = [];
  // Mantém a ordem de empilhamento original: formas na ordem do array, depois
  // textos na ordem do layout.
  const ordenados = [
    ...e.shapes.filter((f) => ids.includes(f.id)).map((f) => f.id),
    ...listarTextos(e.layout).filter((t) => ids.includes(t.id)).map((t) => t.id),
  ];
  for (const id of ordenados) {
    const novoId = gerarId();
    const g = grupoDoLivre(e, id);
    const grupoCopia = g ? novoGrupo.get(g) : undefined;
    const forma = e.shapes.find((f) => f.id === id);
    if (forma) {
      const copia: CardShape = { ...forma, id: novoId, x: forma.x + delta, y: forma.y + delta };
      if (grupoCopia) copia.grupo = grupoCopia;
      else delete copia.grupo;
      shapes.push(copia);
    } else {
      const cfg = e.layout[chaveTexto(id)] as CardTextElementConfig & ComGrupo;
      const copia = { ...cfg, x: cfg.x + delta, y: cfg.y + delta } as CardTextElementConfig & ComGrupo;
      if (grupoCopia) copia.grupo = grupoCopia;
      else delete copia.grupo;
      layout[chaveTexto(novoId)] = copia;
    }
    novos.push(novoId);
  }
  return { estado: { layout: layout as CardLayout, shapes }, novos, ignorados: s.campos.length };
}

// COPIAR / COLAR. A "área de transferência" guarda cópias das formas e textos
// livres selecionados (campos fixos — foto, código, ref... — existem uma vez só e
// ficam de fora). Colar cria elementos NOVOS (ids novos) deslocados `delta` px;
// vários elementos que eram do mesmo grupo viram um grupo novo na colagem.
export type AreaTransferencia = { formas: CardShape[]; textos: (CardTextElementConfig & ComGrupo)[] };

export function copiarElementos(e: EstadoElementos, s: Selecao): AreaTransferencia | null {
  const ids = s.livres.filter((id) => ehLivre(e, id));
  if (ids.length === 0) return null;
  return {
    formas: e.shapes.filter((f) => ids.includes(f.id)).map((f) => ({ ...f })),
    textos: listarTextos(e.layout)
      .filter((t) => ids.includes(t.id))
      .map((t) => {
        const { id, ...cfg } = t;
        void id;
        return { ...cfg } as CardTextElementConfig & ComGrupo;
      }),
  };
}

export function colarElementos(
  e: EstadoElementos,
  area: AreaTransferencia,
  gerarId: () => string,
  delta = 12
): { estado: EstadoElementos; novos: string[] } {
  const contagem = new Map<string, number>();
  for (const g of [...area.formas.map((f) => f.grupo), ...area.textos.map((t) => t.grupo)]) {
    if (g) contagem.set(g, (contagem.get(g) ?? 0) + 1);
  }
  const novoGrupo = new Map<string, string>();
  for (const [g, n] of contagem) if (n >= 2) novoGrupo.set(g, gerarId());

  const layout = { ...e.layout } as Record<string, unknown>;
  const shapes = [...e.shapes];
  const novos: string[] = [];
  for (const forma of area.formas) {
    const id = gerarId();
    const copia: CardShape = { ...forma, id, x: forma.x + delta, y: forma.y + delta };
    const g = forma.grupo ? novoGrupo.get(forma.grupo) : undefined;
    if (g) copia.grupo = g;
    else delete copia.grupo;
    shapes.push(copia);
    novos.push(id);
  }
  for (const texto of area.textos) {
    const id = gerarId();
    const copia = { ...texto, x: texto.x + delta, y: texto.y + delta } as CardTextElementConfig & ComGrupo;
    const g = texto.grupo ? novoGrupo.get(texto.grupo) : undefined;
    if (g) copia.grupo = g;
    else delete copia.grupo;
    layout[chaveTexto(id)] = copia;
    novos.push(id);
  }
  return { estado: { layout: layout as CardLayout, shapes }, novos };
}

// Remove formas e textos livres (campos fixos não são removíveis: ficam
// ligados/desligados pelo checkbox da lista).
export function removerLivres(e: EstadoElementos, ids: string[]): EstadoElementos {
  const layout = { ...e.layout } as Record<string, unknown>;
  for (const id of ids) delete layout[chaveTexto(id)];
  const shapes = e.shapes.filter((f) => !ids.includes(f.id));
  return limparGruposOrfaos({ layout: layout as CardLayout, shapes });
}
