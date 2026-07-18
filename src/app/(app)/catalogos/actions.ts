"use server";

import { createClient } from "@/lib/supabase/server";
import type { CardBorda, CardFieldKey, CardLayout, CardShape } from "./core/cardConfig";

// Primeiro módulo da suite que lê/escreve Postgres além de autenticação
// (Studio e Ofertas usam só R2) — ver esquema em
// supabase/catalogos_schema.sql (rodado manualmente uma vez no Supabase).

export type Catalog = {
  id: string;
  nome: string;
  criado_em: string;
  sectionCount: number;
};

export type Section = {
  id: string;
  catalog_id: string;
  numero: string | null;
  titulo: string;
  ordem: number;
  colunas: number;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function listCatalogs(): Promise<{ catalogs?: Catalog[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const [catalogsRes, sectionsRes] = await Promise.all([
    supabase.from("catalogs").select("id, nome, criado_em").order("criado_em", { ascending: false }),
    supabase.from("sections").select("catalog_id"),
  ]);
  if (catalogsRes.error) return { error: catalogsRes.error.message };
  if (sectionsRes.error) return { error: sectionsRes.error.message };

  const counts = new Map<string, number>();
  for (const s of sectionsRes.data ?? []) counts.set(s.catalog_id, (counts.get(s.catalog_id) ?? 0) + 1);

  const catalogs = (catalogsRes.data ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    criado_em: c.criado_em as string,
    sectionCount: counts.get(c.id as string) ?? 0,
  }));

  return { catalogs };
}

export async function createCatalog(nome: string): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome do catálogo é obrigatório." };

  const { data, error } = await supabase.from("catalogs").insert({ nome: trimmed }).select("id").single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function renameCatalog(id: string, nome: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome do catálogo é obrigatório." };

  const { error } = await supabase
    .from("catalogs")
    .update({ nome: trimmed, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteCatalog(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("catalogs").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export type CatalogDetail = {
  id: string;
  nome: string;
  paginaLargura: number;
  paginaAltura: number;
  planilhaId: string | null;
};

export async function getCatalog(id: string): Promise<{ catalog?: CatalogDetail; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("catalogs")
    .select("id, nome, pagina_largura, pagina_altura, planilha_id")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };
  return {
    catalog: {
      id: data.id,
      nome: data.nome,
      paginaLargura: data.pagina_largura,
      paginaAltura: data.pagina_altura,
      planilhaId: data.planilha_id,
    },
  };
}

export async function getSection(id: string): Promise<{ section?: Section; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("sections")
    .select("id, catalog_id, numero, titulo, ordem, colunas")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };
  return { section: data };
}

export async function listSections(catalogId: string): Promise<{ sections?: Section[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("sections")
    .select("id, catalog_id, numero, titulo, ordem, colunas")
    .eq("catalog_id", catalogId)
    .order("ordem", { ascending: true });
  if (error) return { error: error.message };
  return { sections: data ?? [] };
}

export async function createSection(params: {
  catalogId: string;
  numero: string;
  titulo: string;
  colunas: number;
}): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const titulo = params.titulo.trim();
  if (!titulo) return { error: "Título da seção é obrigatório." };

  // Nova seção entra no fim da lista — busca a maior ordem atual em vez
  // de manter um contador separado no banco.
  const { data: existing, error: existingErr } = await supabase
    .from("sections")
    .select("ordem")
    .eq("catalog_id", params.catalogId)
    .order("ordem", { ascending: false })
    .limit(1);
  if (existingErr) return { error: existingErr.message };
  const nextOrdem = (existing?.[0]?.ordem ?? -1) + 1;

  const { data, error } = await supabase
    .from("sections")
    .insert({
      catalog_id: params.catalogId,
      numero: params.numero.trim() || null,
      titulo,
      colunas: Math.max(1, params.colunas),
      ordem: nextOrdem,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function updateSection(
  id: string,
  patch: { numero?: string; titulo?: string; colunas?: number }
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const update: Record<string, unknown> = {};
  if (patch.numero !== undefined) update.numero = patch.numero.trim() || null;
  if (patch.titulo !== undefined) {
    const titulo = patch.titulo.trim();
    if (!titulo) return { error: "Título da seção é obrigatório." };
    update.titulo = titulo;
  }
  if (patch.colunas !== undefined) update.colunas = Math.max(1, patch.colunas);

  const { error } = await supabase.from("sections").update(update).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteSection(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function reorderSections(orderedIds: string[]): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  // Sem transação multi-linha no supabase-js — dispara os updates em
  // paralelo (cada um só toca a própria linha por id, sem conflito
  // entre eles) e reporta o primeiro erro, se houver algum.
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from("sections").update({ ordem: index }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  return {};
}

// Card-molde de uma seção (Fase 5, Parte 2). Sem versionamento ainda
// (spec seção 3.5, "aplicar a todos vs. só novos") — só faz sentido
// quando existem produtos posicionados numa seção pra divergir de
// versão, o que só existe a partir de uma fase futura. Por enquanto
// `versao` fica sempre 1 e salvar é sempre um UPDATE na mesma linha
// (ou INSERT na primeira vez).
export type CardTemplateData = {
  layout: CardLayout;
  largura: number;
  alturaMinima: number;
  alturaCresceCom: CardFieldKey | null;
  camposHabilitados: CardFieldKey[];
  gutterX: number | null;
  gutterY: number | null;
  shapes: CardShape[];
  borda: CardBorda;
};

export async function getCardTemplate(sectionId: string): Promise<{ template?: CardTemplateData | null; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data, error } = await supabase
    .from("card_templates")
    .select(
      "layout_json, largura, altura_minima, altura_cresce_com, campos_habilitados, gutter_x, gutter_y, shapes_json, borda_json"
    )
    .eq("section_id", sectionId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { template: null };

  return {
    template: {
      layout: data.layout_json as CardLayout,
      largura: data.largura,
      alturaMinima: data.altura_minima,
      alturaCresceCom: data.altura_cresce_com as CardFieldKey | null,
      camposHabilitados: (data.campos_habilitados ?? []) as CardFieldKey[],
      gutterX: data.gutter_x,
      gutterY: data.gutter_y,
      shapes: (data.shapes_json ?? []) as CardShape[],
      borda: data.borda_json as CardBorda,
    },
  };
}

export async function saveCardTemplate(sectionId: string, data: CardTemplateData): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const row = {
    layout_json: data.layout,
    largura: data.largura,
    altura_minima: data.alturaMinima,
    altura_cresce_com: data.alturaCresceCom,
    campos_habilitados: data.camposHabilitados,
    gutter_x: data.gutterX,
    gutter_y: data.gutterY,
    shapes_json: data.shapes,
    borda_json: data.borda,
  };

  const { data: existing, error: existingErr } = await supabase
    .from("card_templates")
    .select("id")
    .eq("section_id", sectionId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) return { error: existingErr.message };

  if (existing) {
    const { error } = await supabase.from("card_templates").update(row).eq("id", existing.id);
    if (error) return { error: error.message };
    return {};
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("card_templates")
    .insert({ section_id: sectionId, ...row })
    .select("id")
    .single();
  if (insertErr) return { error: insertErr.message };

  const { error: linkErr } = await supabase
    .from("sections")
    .update({ card_template_id: inserted.id })
    .eq("id", sectionId);
  if (linkErr) return { error: linkErr.message };

  return {};
}
