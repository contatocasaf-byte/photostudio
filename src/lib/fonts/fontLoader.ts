"use client";

// Promovido de ofertas/fonts/ (Fase 5, Parte 11 do Criador de
// Catálogos) — biblioteca de fontes compartilhada entre os dois
// módulos, sem nada específico de Ofertas.
import { GOOGLE_FONTS, hasWeight } from "./googleFonts";
import { listFonts, type CustomFontEntry } from "./actions";

export type FontOption = {
  family: string;
  weight: number; // 400 = normal, 700 = bold
  source: "google" | "custom";
};

export function listGoogleFontOptions(): FontOption[] {
  return GOOGLE_FONTS.flatMap((f) => f.weights.map((weight) => ({ family: f.family, weight, source: "google" as const })));
}

// Cache em memória da sessão — a lista de fontes próprias muda pouco
// (só quando alguém sobe uma nova); evita um round-trip ao R2 pra cada
// elemento de texto de cada oferta/card/página gerado. Compartilhado
// entre Ofertas e Catálogos (mesmo módulo, mesmo cache) — inofensivo,
// já que os dois listam exatamente o mesmo prefixo do R2.
let customFontsCache: CustomFontEntry[] | null = null;

async function getCustomFonts(): Promise<CustomFontEntry[]> {
  if (!customFontsCache) {
    const { fonts } = await listFonts();
    customFontsCache = fonts ?? [];
  }
  return customFontsCache;
}

export async function listCustomFontOptions(): Promise<FontOption[]> {
  const fonts = await getCustomFonts();
  return fonts.map((f) => ({ family: f.family, weight: f.weight, source: "custom" as const }));
}

// Chamar depois de um upload novo (Editor de Layout / editores do
// Criador de Catálogos) pra próxima leitura ir buscar a lista
// atualizada no R2 em vez do cache.
export function invalidateCustomFontsCache() {
  customFontsCache = null;
}

const pendingLoads = new Map<string, Promise<void>>();

// Garante que família+peso está pronta pro Canvas antes de qualquer
// ctx.fillText — ao contrário de texto DOM, o Canvas não dispara o
// carregamento de @font-face sozinho, só usa o que já estiver
// resolvido no FontFaceSet do documento.
export async function ensureFontLoaded(family: string, weight: number): Promise<void> {
  const cacheKey = `${family}|${weight}`;
  let pending = pendingLoads.get(cacheKey);
  if (pending) return pending;

  pending = hasWeight(family, weight)
    ? // Google Font: o <link> no layout.tsx do módulo já declarou o
      // @font-face — falta só pedir o download de fato.
      document.fonts.load(`${weight} 16px "${family}"`).then(() => undefined)
    : loadCustomFont(family, weight);

  pendingLoads.set(cacheKey, pending);
  return pending;
}

async function loadCustomFont(family: string, weight: number): Promise<void> {
  const fonts = await getCustomFonts();
  const match = fonts.find((f) => f.family === family && f.weight === weight);
  if (!match) {
    // Nem Google Font curada, nem fonte própria enviada — trata como
    // fonte do sistema (ex.: "Arial", valor padrão de layouts/cards/
    // páginas criados antes da biblioteca de fontes existir). O Canvas
    // já resolve essas direto, sem precisar de FontFace nenhuma.
    return;
  }

  const face = new FontFace(family, `url(${match.url})`, { weight: String(weight) });
  await face.load();
  document.fonts.add(face);
}

// Carrega várias família+peso em paralelo — usado antes de renderizar
// (oferta individual/lote, card-molde, página, preview de catálogo),
// coletando todos os pares família/peso realmente usados pelos
// elementos de texto do layout/card/página.
export async function ensureFontsLoaded(pairs: { family: string; weight: number }[]): Promise<void> {
  const unique = new Map(pairs.map((p) => [`${p.family}|${p.weight}`, p]));
  await Promise.all([...unique.values()].map((p) => ensureFontLoaded(p.family, p.weight)));
}
