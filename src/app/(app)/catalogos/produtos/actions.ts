"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
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

  const { data: planilhasData, error: planilhasErr } = await supabase
    .from("planilhas")
    .select("id, nome, criado_em")
    .order("criado_em", { ascending: false });
  if (planilhasErr) return { error: planilhasErr.message };

  // Contagem exata por planilha (head: true, sem baixar linha nenhuma)
  // em vez de buscar TODAS as linhas de `products` e contar em memória
  // — o Supabase limita select() sem range() a 1000 linhas por padrão,
  // o que fazia planilhas grandes (ex. 3000+ produtos) mostrarem
  // contagem errada (às vezes 0) assim que a tabela como um todo
  // passasse desse teto.
  const counts = await Promise.all(
    (planilhasData ?? []).map((p) =>
      supabase.from("products").select("id", { count: "exact", head: true }).eq("planilha_id", p.id)
    )
  );

  const planilhas = (planilhasData ?? []).map((p, i) => ({
    id: p.id as string,
    nome: p.nome as string,
    criadoEm: p.criado_em as string,
    produtoCount: counts[i].count ?? 0,
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

// Atualiza uma planilha existente com um arquivo novo — pedido do
// usuário pra refletir produtos novos que vão entrando no portfólio,
// sem perder o vínculo já existente com os catálogos que usam essa
// planilha (que referenciam por `planilhas.id`, nunca alterado aqui).
//
// NÃO É substituição total (delete + insert): é upsert por
// (planilha_id, codigo) — código que já existe tem
// ref/descrição/preços atualizados NO MESMO registro (mesmo `id` de
// produto), então qualquer `catalog_items` que já aponte pra ele
// continua válido e passa a refletir os dados novos automaticamente;
// código novo vira produto novo; código que não veio no arquivo NÃO é
// removido (não-destrutivo de propósito — evita o mesmo problema de
// FK que a exclusão de planilha trata explicitamente, e evita apagar
// sem querer um produto só porque uma linha foi cortada da planilha
// por engano).
export async function atualizarPlanilha(planilhaId: string, produtos: ProdutoImportRow[]): Promise<{ totalProdutos?: number; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const access = await getCurrentAccess();
  if (!temPermissao(access, "catalogos_atualizar_planilhas")) {
    return { error: "Sem permissão pra atualizar planilhas de produtos." };
  }

  if (produtos.length === 0) return { error: "Nenhum produto encontrado no arquivo (confira as colunas)." };

  const { data: planilha, error: planilhaErr } = await supabase.from("planilhas").select("id").eq("id", planilhaId).maybeSingle();
  if (planilhaErr) return { error: planilhaErr.message };
  if (!planilha) return { error: "Planilha não encontrada." };

  const dedup = new Map<string, ProdutoImportRow>();
  for (const p of produtos) dedup.set(p.codigo, p);

  const rows = [...dedup.values()].map((p) => ({
    planilha_id: planilhaId,
    codigo: p.codigo,
    ref: p.ref || null,
    descricao: p.desc || null,
    preco_1: parsePreco(p.preco1),
    preco_2: parsePreco(p.preco2),
  }));

  const { error: upsertErr } = await supabase.from("products").upsert(rows, { onConflict: "planilha_id,codigo" });
  if (upsertErr) return { error: upsertErr.message };

  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("planilha_id", planilhaId);
  return { totalProdutos: count ?? undefined };
}

// Destrutiva e irreversível (apaga a planilha inteira + seus produtos
// via cascade) — checagem de permissão feita DENTRO da action, não só
// escondendo o botão na tela (mesmo padrão já usado nas actions de
// /usuarios pra capacidades sensíveis). Administrador já tem acesso
// via bypass de temPermissao(); a permissão só precisa ser concedida
// explicitamente pra Supervisor.
export async function deletePlanilha(planilhaId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const access = await getCurrentAccess();
  if (!temPermissao(access, "catalogos_excluir_planilhas")) {
    return { error: "Sem permissão pra excluir planilhas de produtos." };
  }

  // `catalogs.planilha_id` não tem "on delete cascade" (de propósito —
  // apagar uma planilha em uso nunca deve arrancar silenciosamente a
  // fonte de dados de um catálogo real). Bloqueia com uma mensagem que
  // já diz quais catálogos precisam trocar de planilha antes.
  const { data: catalogosEmUso, error: catalogosErr } = await supabase
    .from("catalogs")
    .select("nome")
    .eq("planilha_id", planilhaId);
  if (catalogosErr) return { error: catalogosErr.message };
  if (catalogosEmUso && catalogosEmUso.length > 0) {
    const nomes = catalogosEmUso.map((c) => c.nome as string).join(", ");
    return { error: `Planilha em uso pelo(s) catálogo(s): ${nomes}. Troque a planilha desses catálogos antes de excluir.` };
  }

  // `catalog_items.product_id` também não tem cascade — se algum
  // produto desta planilha já foi adicionado a uma seção (mesmo de um
  // catálogo que já trocou de planilha depois), apagar os produtos
  // (via cascade da planilha) quebraria essa referência. Bloqueia em
  // vez de deixar o Postgres estourar um erro de FK cru pro usuário.
  //
  // Busca os IDs de produto em blocos de 1000 (mesmo teto de linhas do
  // Supabase já corrigido em listPlanilhaProdutos) e checa cada bloco
  // em sub-lotes de 100 no .in() — uma planilha grande (ex. 3253
  // produtos) geraria uma URL gigante se todos os IDs fossem enviados
  // de uma vez só.
  const IN_BATCH = 100;
  const PAGE = 1000;
  outer: for (let from = 0; ; from += PAGE) {
    const { data: page, error: pageErr } = await supabase
      .from("products")
      .select("id")
      .eq("planilha_id", planilhaId)
      .range(from, from + PAGE - 1);
    if (pageErr) return { error: pageErr.message };
    const ids = (page ?? []).map((p) => p.id as string);

    for (let i = 0; i < ids.length; i += IN_BATCH) {
      const slice = ids.slice(i, i + IN_BATCH);
      const { count, error: itemsErr } = await supabase
        .from("catalog_items")
        .select("id", { count: "exact", head: true })
        .in("product_id", slice);
      if (itemsErr) return { error: itemsErr.message };
      if (count && count > 0) {
        return { error: "Um ou mais produtos desta planilha já foram adicionados a seções de catálogos — remova-os antes de excluir a planilha." };
      }
    }

    if (!page || page.length < PAGE) break outer;
  }

  const { error: deleteErr } = await supabase.from("planilhas").delete().eq("id", planilhaId);
  if (deleteErr) return { error: deleteErr.message };
  return {};
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
  // URL da rota-proxy da galeria (Fase 5, Parte 7), resolvida por
  // código a partir da pasta do Drive configurada — null se a galeria
  // não estiver configurada ou nenhuma foto bater com esse código.
  // Só populado em catalogos/preview/actions.ts (onde a foto real
  // importa de fato); aqui fica sempre null, ver decisão na Parte 7.
  fotoUrl: string | null;
};

const SELECT_PAGE_SIZE = 1000;

export async function listPlanilhaProdutos(planilhaId: string): Promise<{ produtos?: ProductRow[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  // Paginado (range em blocos de 1000) — o Supabase limita select() sem
  // range() a 1000 linhas por padrão; uma planilha real facilmente
  // passa disso (ex. 3253 produtos), o que truncava a lista sem erro
  // nenhum, deixando parte dos produtos invisíveis pra busca/adição.
  type Row = { id: string; codigo: string; ref: string | null; descricao: string | null; preco_1: number | null; preco_2: number | null };
  const rows: Row[] = [];
  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, codigo, ref, descricao, preco_1, preco_2")
      .eq("planilha_id", planilhaId)
      .order("codigo", { ascending: true })
      .range(from, from + SELECT_PAGE_SIZE - 1);
    if (error) return { error: error.message };
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < SELECT_PAGE_SIZE) break;
  }

  return {
    produtos: rows.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      ref: p.ref,
      descricao: p.descricao,
      preco1: p.preco_1,
      preco2: p.preco_2,
      fotoUrl: null,
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
          fotoUrl: null,
        } as ProductRow,
      };
    })
    .filter((x): x is SectionItem => x !== null);

  return { items };
}

// Grava a versão ATUAL do card-molde da seção no momento em que o
// produto é adicionado (spec seção 3.5, Fase 5 Parte 8) — itens
// antigos mantêm a versão que tinham quando entraram; só o
// card-molde muda de versão dali pra frente.
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

// Fase 5, Parte 8 (versionamento) — decide se salvar o card-molde
// dessa seção precisa perguntar "aplicar a todos vs. só aos novos"
// (spec 3.5). Sem produto nenhum posicionado ainda, a pergunta não faz
// sentido: salvar continua sendo update in-place, sem gerar versão
// nova, enquanto o usuário ainda está iterando no design do card.
export async function sectionHasItems(sectionId: string): Promise<{ hasItems?: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase.from("catalog_items").select("id").eq("section_id", sectionId).limit(1);
  if (error) return { error: error.message };
  return { hasItems: (data?.length ?? 0) > 0 };
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
