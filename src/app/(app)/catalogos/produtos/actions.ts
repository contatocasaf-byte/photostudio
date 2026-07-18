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
