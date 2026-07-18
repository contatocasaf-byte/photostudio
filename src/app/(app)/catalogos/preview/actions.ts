"use server";

import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage/public-url";
import { defaultCardBorda } from "../core/cardConfig";
import { buildGaleriaIndex, resolveGaleriaFoto } from "../core/matchGaleriaFoto";
import { listGaleriaImages } from "../galeria/actions";
import type { PageTipo } from "../core/pageConfig";
import type { CardTemplateInput, PageTemplateInput, SectionReflowInput } from "../core/reflow";
import type { ProductRow } from "../produtos/actions";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Gutter ainda não capturado (Editor de Card-molde, "Definir
// espaçamento") — fallback razoável pro reflow não colapsar os cards
// uns em cima dos outros.
const DEFAULT_GUTTER_X_EXTRA = 20;
const DEFAULT_GUTTER_Y = 20;

export type CatalogPreviewData = {
  catalogNome: string;
  paginaLargura: number;
  paginaAltura: number;
  pageTemplates: Partial<Record<PageTipo, PageTemplateInput>>;
  sections: SectionReflowInput[];
};

// Busca consolidada — catálogo, os 3 page_templates, seções com seus
// card_templates, e os itens+produtos de cada seção — numa função só,
// evitando round-trips separados na tela de preview.
export async function getCatalogPreviewData(catalogId: string): Promise<{ data?: CatalogPreviewData; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data: catalog, error: catalogErr } = await supabase
    .from("catalogs")
    .select("nome, pagina_largura, pagina_altura")
    .eq("id", catalogId)
    .single();
  if (catalogErr) return { error: catalogErr.message };

  const [{ data: pageTemplateRows, error: ptErr }, { data: sectionRows, error: secErr }, galeriaRes] = await Promise.all([
    supabase.from("page_templates").select("tipo, header_json, footer_json, margens, fundo_key").eq("catalog_id", catalogId),
    supabase
      .from("sections")
      .select("id, titulo, ordem, colunas, card_template_id")
      .eq("catalog_id", catalogId)
      .order("ordem", { ascending: true }),
    listGaleriaImages(),
  ]);
  if (ptErr) return { error: ptErr.message };
  if (secErr) return { error: secErr.message };
  // Erro na galeria não derruba o preview inteiro — só os cards ficam
  // sem foto real (volta pro placeholder tracejado de sempre).
  const galeriaIndex = buildGaleriaIndex(galeriaRes.files ?? []);

  const pageTemplates: Partial<Record<PageTipo, PageTemplateInput>> = {};
  for (const row of pageTemplateRows ?? []) {
    const tipo = row.tipo as PageTipo;
    const layout = { ...((row.header_json as object) ?? {}), ...((row.footer_json as object) ?? {}) };
    pageTemplates[tipo] = {
      layout: layout as PageTemplateInput["layout"],
      elementosHabilitados: Object.keys(layout) as PageTemplateInput["elementosHabilitados"],
      margens: row.margens as PageTemplateInput["margens"],
      fundoUrl: row.fundo_key ? getPublicUrl(row.fundo_key as string) : null,
    };
  }

  const cardTemplateIds = (sectionRows ?? [])
    .map((s) => s.card_template_id as string | null)
    .filter((id): id is string => !!id);
  const { data: cardTemplateRows, error: ctErr } =
    cardTemplateIds.length > 0
      ? await supabase
          .from("card_templates")
          .select(
            "id, layout_json, largura, altura_minima, altura_cresce_com, campos_habilitados, gutter_x, gutter_y, shapes_json, borda_json"
          )
          .in("id", cardTemplateIds)
      : { data: [], error: null };
  if (ctErr) return { error: ctErr.message };
  const cardTemplateById = new Map((cardTemplateRows ?? []).map((c) => [c.id as string, c]));

  const sectionIds = (sectionRows ?? []).map((s) => s.id as string);
  const { data: itemRows, error: itemsErr } =
    sectionIds.length > 0
      ? await supabase
          .from("catalog_items")
          .select("section_id, ordem, product_id")
          .in("section_id", sectionIds)
          .order("ordem", { ascending: true })
      : { data: [], error: null };
  if (itemsErr) return { error: itemsErr.message };

  const productIds = [...new Set((itemRows ?? []).map((r) => r.product_id as string))];
  const { data: productRows, error: prodErr } =
    productIds.length > 0
      ? await supabase.from("products").select("id, codigo, ref, descricao, preco_1, preco_2").in("id", productIds)
      : { data: [], error: null };
  if (prodErr) return { error: prodErr.message };

  const productById = new Map(
    (productRows ?? []).map((p) => {
      const fileId = resolveGaleriaFoto(galeriaIndex, p.codigo as string);
      return [
        p.id as string,
        {
          id: p.id as string,
          codigo: p.codigo as string,
          ref: p.ref,
          descricao: p.descricao,
          preco1: p.preco_1,
          preco2: p.preco_2,
          fotoUrl: fileId ? `/api/catalogos/galeria/${fileId}` : null,
        } as ProductRow,
      ];
    })
  );

  const itemsBySection = new Map<string, { product: ProductRow }[]>();
  for (const row of itemRows ?? []) {
    const product = productById.get(row.product_id as string);
    if (!product) continue;
    const sectionId = row.section_id as string;
    const list = itemsBySection.get(sectionId) ?? [];
    list.push({ product });
    itemsBySection.set(sectionId, list);
  }

  const sections: SectionReflowInput[] = (sectionRows ?? []).map((s) => {
    const templateId = s.card_template_id as string | null;
    const ct = templateId ? cardTemplateById.get(templateId) : undefined;
    const cardTemplate: CardTemplateInput | null = ct
      ? {
          layout: ct.layout_json as CardTemplateInput["layout"],
          largura: ct.largura as number,
          alturaMinima: ct.altura_minima as number,
          alturaCresceCom: ct.altura_cresce_com as CardTemplateInput["alturaCresceCom"],
          gutterX: (ct.gutter_x as number | null) ?? (ct.largura as number) + DEFAULT_GUTTER_X_EXTRA,
          gutterY: (ct.gutter_y as number | null) ?? DEFAULT_GUTTER_Y,
          camposHabilitados: (ct.campos_habilitados as CardTemplateInput["camposHabilitados"]) ?? [],
          shapes: (ct.shapes_json as CardTemplateInput["shapes"]) ?? [],
          borda: (ct.borda_json as CardTemplateInput["borda"]) ?? defaultCardBorda(),
        }
      : null;

    return {
      id: s.id as string,
      titulo: s.titulo as string,
      colunas: s.colunas as number,
      cardTemplate,
      items: itemsBySection.get(s.id as string) ?? [],
    };
  });

  return {
    data: {
      catalogNome: catalog.nome,
      paginaLargura: catalog.pagina_largura,
      paginaAltura: catalog.pagina_altura,
      pageTemplates,
      sections,
    },
  };
}
