"use server";

import { createClient } from "@/lib/supabase/server";
import type { ProdutoImportRow } from "../core/parsePlanilhaProdutos";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export type Planilha = { id: string; nome: string; criadoEm: string; produtoCount: number };

export async function listPlanilhas(): Promise<{ planilhas?: Planilha[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const [planilhasRes, productsRes] = await Promise.all([
    supabase.from("planilhas").select("id, nome, criado_em").order("criado_em", { ascending: false }),
    supabase.from("products").select("planilha_id"),
  ]);
  if (planilhasRes.error) return { error: planilhasRes.error.message };
  if (productsRes.error) return { error: productsRes.error.message };

  const counts = new Map<string, number>();
  for (const p of productsRes.data ?? []) counts.set(p.planilha_id, (counts.get(p.planilha_id) ?? 0) + 1);

  const planilhas = (planilhasRes.data ?? []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    criadoEm: p.criado_em as string,
    produtoCount: counts.get(p.id as string) ?? 0,
  }));

  return { planilhas };
}

// "R$ 1.234,56" -> 1234.56. Vírgula é sempre o separador decimal (padrão
// BR); pontos antes dela são separador de milhar e são descartados.
function parsePreco(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

export async function createPlanilhaComProdutos(
  nome: string,
  produtos: ProdutoImportRow[]
): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome da planilha é obrigatório." };
  if (produtos.length === 0) return { error: "Nenhum produto encontrado na planilha (confira as colunas)." };

  const { data: planilha, error: planilhaErr } = await supabase.from("planilhas").insert({ nome: trimmed }).select("id").single();
  if (planilhaErr) return { error: planilhaErr.message };

  // Dedupe por código, mantendo a última ocorrência — mesma regra
  // implícita de qualquer import de planilha: a linha mais abaixo
  // "vence" se o código se repetir.
  const dedup = new Map<string, ProdutoImportRow>();
  for (const p of produtos) dedup.set(p.codigo, p);

  const rows = [...dedup.values()].map((p) => ({
    planilha_id: planilha.id,
    codigo: p.codigo,
    ref: p.ref || null,
    descricao: p.desc || null,
    preco_1: parsePreco(p.preco1),
    preco_2: parsePreco(p.preco2),
  }));

  const { error: insertErr } = await supabase.from("products").insert(rows);
  if (insertErr) {
    // Planilha já foi criada mas os produtos falharam — remove pra não
    // deixar uma planilha "fantasma" vazia na lista.
    await supabase.from("planilhas").delete().eq("id", planilha.id);
    return { error: insertErr.message };
  }

  return { id: planilha.id };
}

export async function setCatalogPlanilha(catalogId: string, planilhaId: string | null): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("catalogs").update({ planilha_id: planilhaId }).eq("id", catalogId);
  if (error) return { error: error.message };
  return {};
}

// Produtos por Seção (Fase 5, Parte 5) — vincula produtos da planilha
// do catálogo a uma seção específica (catalog_items).

export type ProductRow = {
  id: string;
  codigo: string;
  ref: string | null;
  descricao: string | null;
  preco1: number | null;
  preco2: number | null;
};

export async function listPlanilhaProdutos(planilhaId: string): Promise<{ produtos?: ProductRow[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("products")
    .select("id, codigo, ref, descricao, preco_1, preco_2")
    .eq("planilha_id", planilhaId)
    .order("codigo", { ascending: true });
  if (error) return { error: error.message };
  return {
    produtos: (data ?? []).map((p) => ({
      id: p.id as string,
      codigo: p.codigo as string,
      ref: p.ref,
      descricao: p.descricao,
      preco1: p.preco_1,
      preco2: p.preco_2,
    })),
  };
}

export type SectionItem = { id: string; ordem: number; product: ProductRow };

export async function listSectionItems(sectionId: string): Promise<{ items?: SectionItem[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data: itemRows, error: itemsErr } = await supabase
    .from("catalog_items")
    .select("id, ordem, product_id")
    .eq("section_id", sectionId)
    .order("ordem", { ascending: true });
  if (itemsErr) return { error: itemsErr.message };
  if (!itemRows || itemRows.length === 0) return { items: [] };

  const productIds = itemRows.map((r) => r.product_id as string);
  const { data: products, error: productsErr } = await supabase
    .from("products")
    .select("id, codigo, ref, descricao, preco_1, preco_2")
    .in("id", productIds);
  if (productsErr) return { error: productsErr.message };

  const byId = new Map((products ?? []).map((p) => [p.id as string, p]));
  const items = itemRows
    .map((row) => {
      const p = byId.get(row.product_id as string);
      if (!p) return null;
      return {
        id: row.id as string,
        ordem: row.ordem as number,
        product: {
          id: p.id as string,
          codigo: p.codigo as string,
          ref: p.ref,
          descricao: p.descricao,
          preco1: p.preco_1,
          preco2: p.preco_2,
        },
      };
    })
    .filter((x): x is SectionItem => x !== null);

  return { items };
}

// Grava a versão ATUAL do card-molde da seção no momento em que o
// produto é adicionado (spec seção 3.5) — hoje sempre 1, já que
// versionamento ainda não existe (fase futura), mas já é o valor certo
// pra quando existir: itens antigos mantêm a versão que tinham quando
// entraram, só o card-molde muda de versão.
export async function addProductToSection(sectionId: string, productId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const [{ data: existing, error: existingErr }, { data: section, error: sectionErr }] = await Promise.all([
    supabase.from("catalog_items").select("ordem").eq("section_id", sectionId).order("ordem", { ascending: false }).limit(1),
    supabase.from("sections").select("card_template_id").eq("id", sectionId).single(),
  ]);
  if (existingErr) return { error: existingErr.message };
  if (sectionErr) return { error: sectionErr.message };

  let versao = 1;
  if (section?.card_template_id) {
    const { data: template, error: templateErr } = await supabase
      .from("card_templates")
      .select("versao")
      .eq("id", section.card_template_id)
      .single();
    if (templateErr) return { error: templateErr.message };
    versao = template?.versao ?? 1;
  }

  const nextOrdem = (existing?.[0]?.ordem ?? -1) + 1;

  const { error: insertErr } = await supabase.from("catalog_items").insert({
    section_id: sectionId,
    product_id: productId,
    ordem: nextOrdem,
    card_template_versao: versao,
  });
  if (insertErr) return { error: insertErr.message };
  return {};
}

export async function removeSectionItem(itemId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("catalog_items").delete().eq("id", itemId);
  if (error) return { error: error.message };
  return {};
}

export async function reorderSectionItems(orderedItemIds: string[]): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const results = await Promise.all(
    orderedItemIds.map((id, index) => supabase.from("catalog_items").update({ ordem: index }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  return {};
}
