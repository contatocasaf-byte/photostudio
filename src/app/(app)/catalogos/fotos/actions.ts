"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages, fetchInChunks } from "@/lib/supabase/fetchAll";
import { buildGaleriaIndex, resolveGaleriaFoto } from "../core/matchGaleriaFoto";
import { listGaleriaImages } from "../galeria/actions";
import { chaveLista, codigoNumerico, extensaoDoArquivo, linkGaleria, LISTA_FOTOS_CSV_URL, parseListaFotosCsv } from "./galeriaLink";

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

const IN_CHUNK = 150;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type ItemRow = { section_id: string; product_id: string; ordem: number };
type ProdutoBasico = { codigo: string; ref: string; descricao: string };

// Itens do catálogo (seções na ordem, itens na ordem de cada seção) e os
// dados básicos de cada produto — compartilhado pelas estatísticas de
// foto e pelo relatório de itens.
async function carregarItensDoCatalogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  catalogId: string
): Promise<{ sectionIds: string[]; items: ItemRow[]; productById: Map<string, ProdutoBasico>; error?: string }> {
  const vazio = { sectionIds: [] as string[], items: [] as ItemRow[], productById: new Map<string, ProdutoBasico>() };

  const { data: sectionRows, error: secErr } = await supabase
    .from("sections")
    .select("id, ordem")
    .eq("catalog_id", catalogId)
    .order("ordem", { ascending: true });
  if (secErr) return { ...vazio, error: secErr.message };
  const sectionIds = (sectionRows ?? []).map((s) => s.id as string);

  const itemsRes =
    sectionIds.length > 0
      ? await fetchAllPages<ItemRow>((from, to) =>
          supabase
            .from("catalog_items")
            .select("section_id, product_id, ordem")
            .in("section_id", sectionIds)
            .order("section_id", { ascending: true })
            .order("ordem", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to)
        )
      : { data: [] as ItemRow[], error: undefined as string | undefined };
  if (itemsRes.error) return { ...vazio, sectionIds, error: itemsRes.error };
  const items = itemsRes.data;

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const productsRes = await fetchInChunks<Record<string, unknown>, string>(productIds, IN_CHUNK, (chunk) =>
    supabase.from("products").select("id, codigo, ref, descricao").in("id", chunk)
  );
  if (productsRes.error) return { ...vazio, sectionIds, items, error: productsRes.error };
  const productById = new Map<string, ProdutoBasico>();
  for (const p of productsRes.data) {
    productById.set(p.id as string, {
      codigo: String(p.codigo ?? ""),
      ref: String(p.ref ?? ""),
      descricao: String(p.descricao ?? ""),
    });
  }

  return { sectionIds, items, productById };
}

export type ItemRelatorio = {
  codigo: string;
  ref: string;
  descricao: string;
  // Rótulo "📷 N fotos" ("sem foto" se o código não está na lista, "—"
  // se o código não é numérico) e link da galeria — null quando não há
  // o que abrir.
  fotosRotulo: string;
  fotosUrl: string | null;
  // Extensão do arquivo da foto que o CATÁLOGO usa de fato (a da galeria
  // configurada — pasta sem marca d'água —, a mesma do preview/PDF):
  // "JPG", "JPEG", "PNG"... ; "sem foto" se o catálogo não tem foto
  // pra esse código; "—" se a galeria não pôde ser lida.
  extensao: string;
};

// Relatório de TODOS os itens cadastrados no catálogo (um por produto,
// na ordem das seções), com link pra mesma página de galeria do
// catálogo ZENOAH — ver galeriaLink.ts.
export async function getCatalogItensRelatorio(catalogId: string): Promise<{ itens?: ItemRelatorio[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const carregado = await carregarItensDoCatalogo(supabase, catalogId);
  if (carregado.error) return { error: carregado.error };

  let lista: Map<string, string>;
  try {
    const res = await fetch(LISTA_FOTOS_CSV_URL, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    lista = parseListaFotosCsv(await res.text());
    if (lista.size === 0) throw new Error("lista vazia");
  } catch (e) {
    return {
      error: `Não foi possível ler a lista de fotos (planilha publicada do Google): ${e instanceof Error ? e.message : "erro desconhecido"}. Tente de novo em instantes.`,
    };
  }

  // Foto que o catálogo usa (galeria configurada) — mesma resolução do
  // preview/PDF; dela sai a extensão do arquivo.
  const galeriaRes = await listGaleriaImages();
  const galeriaFiles = galeriaRes.files ?? [];
  const galeriaLegivel = !galeriaRes.error && galeriaFiles.length > 0;
  const galeriaIndex = buildGaleriaIndex(galeriaFiles);
  const nomePorId = new Map(galeriaFiles.map((f) => [f.id, f.name]));

  const itensPorSecao = new Map<string, ItemRow[]>();
  for (const item of carregado.items) {
    const list = itensPorSecao.get(item.section_id) ?? [];
    list.push(item);
    itensPorSecao.set(item.section_id, list);
  }

  const itens: ItemRelatorio[] = [];
  const jaListado = new Set<string>();
  for (const sectionId of carregado.sectionIds) {
    for (const item of itensPorSecao.get(sectionId) ?? []) {
      const produto = carregado.productById.get(item.product_id);
      if (!produto || jaListado.has(item.product_id)) continue;
      jaListado.add(item.product_id);

      const numerico = codigoNumerico(produto.codigo);
      const rotulo = numerico ? lista.get(chaveLista(numerico)) : undefined;
      let extensao = "—";
      if (galeriaLegivel) {
        const fileId = resolveGaleriaFoto(galeriaIndex, produto.codigo);
        extensao = fileId ? extensaoDoArquivo(nomePorId.get(fileId) ?? "") || "—" : "sem foto";
      }

      itens.push({
        ...produto,
        fotosRotulo: !numerico ? "—" : (rotulo ?? "sem foto"),
        fotosUrl: numerico && rotulo ? linkGaleria(numerico) : null,
        extensao,
      });
    }
  }

  return { itens };
}

export async function getCatalogFotoStats(catalogId: string): Promise<{ stats?: CatalogFotoStats; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const carregado = await carregarItensDoCatalogo(supabase, catalogId);
  if (carregado.error) return { error: carregado.error };
  const { sectionIds, items, productById } = carregado;

  const galeriaRes = await listGaleriaImages();
  const files = galeriaRes.files ?? [];
  const galeriaIndisponivel = !!galeriaRes.error || files.length === 0;
  const index = buildGaleriaIndex(files);

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
