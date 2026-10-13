"use server";

import { createClient } from "@/lib/supabase/server";
import { buildGaleriaIndex, resolveGaleriaFoto } from "../core/matchGaleriaFoto";
import { listGaleriaImages } from "../galeria/actions";

// Cobertura de fotos do catálogo (quantos itens já têm foto na galeria
// do Drive) — mostrada na lista de seções e no "Ver catálogo", e base
// do relatório de itens sem foto pra editores/fotógrafos. "Com foto" =
// o mesmo critério do preview/PDF: o código do produto casa com algum
// arquivo da galeria (ver matchGaleriaFoto.ts).

export type FotoStats = { total: number; comFoto: number };
export type ItemSemFoto = { codigo: string; ref: string; descricao: string };

export type CatalogFotoStats = {
  geral: FotoStats;
  porSecao: Record<string, FotoStats>;
  // Um por PRODUTO (não por item — o mesmo produto em duas seções
  // aparece uma vez só), na ordem das seções.
  semFoto: ItemSemFoto[];
  // Galeria não configurada, vazia ou com falha ao listar: nesse caso
  // todo item aparece "sem foto" — a tela avisa em vez de enganar.
  galeriaIndisponivel: boolean;
};

const PAGE_SIZE = 1000;
const IN_CHUNK = 150;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getCatalogFotoStats(catalogId: string): Promise<{ stats?: CatalogFotoStats; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data: sectionRows, error: secErr } = await supabase
    .from("sections")
    .select("id, ordem")
    .eq("catalog_id", catalogId)
    .order("ordem", { ascending: true });
  if (secErr) return { error: secErr.message };
  const sectionIds = (sectionRows ?? []).map((s) => s.id as string);

  const galeriaRes = await listGaleriaImages();
  const files = galeriaRes.files ?? [];
  const galeriaIndisponivel = !!galeriaRes.error || files.length === 0;
  const index = buildGaleriaIndex(files);

  // Itens da seção, paginados (o Supabase corta em 1000 linhas por
  // consulta — catálogo grande passa disso).
  const items: { section_id: string; product_id: string; ordem: number }[] = [];
  if (sectionIds.length > 0) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("catalog_items")
        .select("section_id, product_id, ordem")
        .in("section_id", sectionIds)
        .order("section_id", { ascending: true })
        .order("ordem", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { error: error.message };
      items.push(...((data ?? []) as typeof items));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const productById = new Map<string, { codigo: string; ref: string; descricao: string }>();
  for (let i = 0; i < productIds.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("products")
      .select("id, codigo, ref, descricao")
      .in("id", productIds.slice(i, i + IN_CHUNK));
    if (error) return { error: error.message };
    for (const p of data ?? []) {
      productById.set(p.id as string, {
        codigo: String(p.codigo ?? ""),
        ref: String(p.ref ?? ""),
        descricao: String(p.descricao ?? ""),
      });
    }
  }

  const temFoto = new Map<string, boolean>();
  for (const [id, p] of productById) temFoto.set(id, resolveGaleriaFoto(index, p.codigo) !== null);

  const porSecao: Record<string, FotoStats> = {};
  for (const id of sectionIds) porSecao[id] = { total: 0, comFoto: 0 };
  const geral: FotoStats = { total: 0, comFoto: 0 };
  const itensPorSecao = new Map<string, typeof items>();
  for (const item of items) {
    if (!productById.has(item.product_id)) continue;
    const com = temFoto.get(item.product_id) === true;
    porSecao[item.section_id].total++;
    geral.total++;
    if (com) {
      porSecao[item.section_id].comFoto++;
      geral.comFoto++;
    }
    const list = itensPorSecao.get(item.section_id) ?? [];
    list.push(item);
    itensPorSecao.set(item.section_id, list);
  }

  const semFoto: ItemSemFoto[] = [];
  const jaListado = new Set<string>();
  for (const sectionId of sectionIds) {
    for (const item of itensPorSecao.get(sectionId) ?? []) {
      if (temFoto.get(item.product_id) || jaListado.has(item.product_id)) continue;
      jaListado.add(item.product_id);
      semFoto.push(productById.get(item.product_id) as ItemSemFoto);
    }
  }

  return { stats: { geral, porSecao, semFoto, galeriaIndisponivel } };
}
