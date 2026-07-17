"use server";

import { createClient } from "@/lib/supabase/server";

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

export async function getCatalog(id: string): Promise<{ catalog?: { id: string; nome: string }; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase.from("catalogs").select("id, nome").eq("id", id).single();
  if (error) return { error: error.message };
  return { catalog: data };
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
