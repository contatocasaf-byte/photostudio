"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage/public-url";
import { defaultCardBorda } from "../core/cardConfig";
import { buildGaleriaIndex, resolveGaleriaFoto } from "../core/matchGaleriaFoto";
import { listGaleriaImages } from "../galeria/actions";
import type { PageIllustration, PageShape, PageTipo } from "../core/pageConfig";
import type { CardTemplateInput, PageTemplateInput, PaginaAvulsaInput, SectionReflowInput } from "../core/reflow";
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

// Reaproveitado pra mapear TODAS as versões de um card_templates de
// uma seção (Fase 5, Parte 8 — versionamento), não só a apontada por
// sections.card_template_id.
function cardTemplateFromRow(row: Record<string, unknown>): CardTemplateInput {
  return {
    layout: row.layout_json as CardTemplateInput["layout"],
    largura: row.largura as number,
    alturaMinima: row.altura_minima as number,
    alturaCresceCom: row.altura_cresce_com as CardTemplateInput["alturaCresceCom"],
    gutterX: (row.gutter_x as number | null) ?? (row.largura as number) + DEFAULT_GUTTER_X_EXTRA,
    gutterY: (row.gutter_y as number | null) ?? DEFAULT_GUTTER_Y,
    camposHabilitados: (row.campos_habilitados as CardTemplateInput["camposHabilitados"]) ?? [],
    shapes: (row.shapes_json as CardTemplateInput["shapes"]) ?? [],
    borda: (row.borda_json as CardTemplateInput["borda"]) ?? defaultCardBorda(),
  };
}

export type CatalogPreviewData = {
  catalogNome: string;
  paginaLargura: number;
  paginaAltura: number;
  pageTemplates: Partial<Record<PageTipo, PageTemplateInput>>;
  sections: SectionReflowInput[];
  paginasAvulsas: PaginaAvulsaInput[];
};

// Busca consolidada — catálogo, os 3 page_templates fixos + os
// page_templates tipo='custom' de páginas avulsas (Fase 5, Parte 12),
// seções com seus card_templates, e os itens+produtos de cada seção —
// numa função só, evitando round-trips separados na tela de preview.
export async function getCatalogPreviewData(catalogId: string): Promise<{ data?: CatalogPreviewData; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data: catalog, error: catalogErr } = await supabase
    .from("catalogs")
    .select("nome, pagina_largura, pagina_altura, abertura_secao_default_id")
    .eq("id", catalogId)
    .single();
  if (catalogErr) return { error: catalogErr.message };

  const [{ data: pageTemplateRows, error: ptErr }, { data: sectionRows, error: secErr }, { data: avulsaRows, error: avErr }, galeriaRes] =
    await Promise.all([
      supabase
        .from("page_templates")
        .select("id, tipo, header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json")
        .eq("catalog_id", catalogId),
      supabase
        .from("sections")
        .select("id, titulo, ordem, colunas, card_template_id, abertura_template_id")
        .eq("catalog_id", catalogId)
        .order("ordem", { ascending: true }),
      supabase.from("paginas_avulsas").select("id, titulo, apos_secao_id, ordem, page_template_id").eq("catalog_id", catalogId),
      listGaleriaImages(),
    ]);
  if (ptErr) return { error: ptErr.message };
  if (secErr) return { error: secErr.message };
  if (avErr) return { error: avErr.message };
  // Erro na galeria não derruba o preview inteiro — só os cards ficam
  // sem foto real (volta pro placeholder tracejado de sempre).
  const galeriaIndex = buildGaleriaIndex(galeriaRes.files ?? []);

  // page_templates tipo='custom' não vai pro slot fixo por tipo (pode
  // haver várias, uma por página avulsa) — fica num mapa por id,
  // resolvido pra cada paginas_avulsas abaixo. tipo='abertura_secao'
  // (Fase 5, Parte 15) tem o mesmo problema — pode haver várias
  // variantes por catálogo — fica no próprio mapa, resolvido por seção
  // (abertura_template_id) ou pelo padrão do catálogo
  // (abertura_secao_default_id) logo abaixo.
  const pageTemplates: Partial<Record<PageTipo, PageTemplateInput>> = {};
  const customTemplatesById = new Map<string, PageTemplateInput>();
  const aberturaTemplatesById = new Map<string, PageTemplateInput>();
  for (const row of pageTemplateRows ?? []) {
    const tipo = row.tipo as PageTipo;
    const rawHeader = (row.header_json as Record<string, unknown>) ?? {};
    const layout = { ...rawHeader, ...((row.footer_json as object) ?? {}) };

    // Migração suave (Fase 5, Parte 13, mesma lógica de
    // catalogos/paginas/actions.ts): "ilustracao" era 1 campo fixo,
    // agora é lista — modelo salvo antes disso ainda tem o campo solto
    // em header_json, essa ilustração antiga vira o 1º item da lista
    // nova (só nesta leitura; grava de verdade no próximo Salvar).
    let illustracoes = ((row.illustracoes_json as PageIllustration[] | null) ?? []) as PageIllustration[];
    const legacyIlustracao = rawHeader.ilustracao as Omit<PageIllustration, "id"> | undefined;
    if (illustracoes.length === 0 && legacyIlustracao) {
      illustracoes = [{ id: randomUUID(), ...legacyIlustracao }];
    }

    const built: PageTemplateInput = {
      layout: layout as PageTemplateInput["layout"],
      elementosHabilitados: Object.keys(layout).filter((k) => k !== "ilustracao") as PageTemplateInput["elementosHabilitados"],
      margens: row.margens as PageTemplateInput["margens"],
      fundoUrl: row.fundo_key ? getPublicUrl(row.fundo_key as string) : null,
      fundoKey: (row.fundo_key as string | null) ?? null,
      fundoPdfKey: (row.fundo_pdf_key as string | null) ?? null,
      illustracoes,
      formas: ((row.formas_json as PageShape[] | null) ?? []) as PageShape[],
    };
    if (tipo === "custom") customTemplatesById.set(row.id as string, built);
    else if (tipo === "abertura_secao") aberturaTemplatesById.set(row.id as string, built);
    else pageTemplates[tipo] = built;
  }

  // Padrão do catálogo pra abertura_secao (Parte 15) — usado por
  // qualquer seção que não escolher uma variante própria. Sem padrão
  // configurado, `pageTemplates.abertura_secao` fica undefined (mesmo
  // comportamento de "não configurado" de antes desta parte).
  const aberturaSecaoDefaultId = catalog.abertura_secao_default_id as string | null;
  if (aberturaSecaoDefaultId) {
    const aberturaDefault = aberturaTemplatesById.get(aberturaSecaoDefaultId);
    if (aberturaDefault) pageTemplates.abertura_secao = aberturaDefault;
  }

  const paginasAvulsas: PaginaAvulsaInput[] = (avulsaRows ?? [])
    .map((row) => {
      const template = customTemplatesById.get(row.page_template_id as string);
      if (!template) return null;
      return {
        id: row.id as string,
        titulo: row.titulo as string,
        aposSecaoId: row.apos_secao_id as string | null,
        ordem: row.ordem as number,
        template,
      };
    })
    .filter((x): x is PaginaAvulsaInput => x !== null);

  // Busca TODAS as versões de card_templates de cada seção (Fase 5,
  // Parte 8) — não só a apontada por sections.card_template_id (essa
  // continua sendo "a atual", usada pra estrutura da grade) — pra
  // resolver o molde de cada item pela sua própria versão gravada.
  const sectionIds = (sectionRows ?? []).map((s) => s.id as string);
  const [{ data: cardTemplateRows, error: ctErr }, { data: itemRows, error: itemsErr }] = await Promise.all([
    sectionIds.length > 0
      ? supabase
          .from("card_templates")
          .select(
            "id, section_id, versao, layout_json, largura, altura_minima, altura_cresce_com, campos_habilitados, gutter_x, gutter_y, shapes_json, borda_json"
          )
          .in("section_id", sectionIds)
      : Promise.resolve({ data: [], error: null }),
    sectionIds.length > 0
      ? supabase
          .from("catalog_items")
          .select("section_id, ordem, product_id, card_template_versao")
          .in("section_id", sectionIds)
          .order("ordem", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (ctErr) return { error: ctErr.message };
  if (itemsErr) return { error: itemsErr.message };

  const templatesBySection = new Map<string, { id: string; versao: number; template: CardTemplateInput }[]>();
  for (const row of cardTemplateRows ?? []) {
    const sectionId = row.section_id as string;
    const list = templatesBySection.get(sectionId) ?? [];
    list.push({ id: row.id as string, versao: row.versao as number, template: cardTemplateFromRow(row) });
    templatesBySection.set(sectionId, list);
  }

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

  // Item sem card_template_versao gravado (não deveria acontecer via
  // addProductToSection, mas todo card_templates existente até a Parte
  // 8 é sempre versão 1 — fallback seguro pra dado legado).
  const itemsBySection = new Map<string, { product: ProductRow; cardTemplateVersao: number }[]>();
  for (const row of itemRows ?? []) {
    const product = productById.get(row.product_id as string);
    if (!product) continue;
    const sectionId = row.section_id as string;
    const list = itemsBySection.get(sectionId) ?? [];
    list.push({ product, cardTemplateVersao: (row.card_template_versao as number | null) ?? 1 });
    itemsBySection.set(sectionId, list);
  }

  const sections: SectionReflowInput[] = (sectionRows ?? []).map((s) => {
    const templateId = s.card_template_id as string | null;
    const versions = templatesBySection.get(s.id as string) ?? [];
    const atual = templateId ? versions.find((v) => v.id === templateId) : undefined;

    const aberturaTemplateId = s.abertura_template_id as string | null;

    return {
      id: s.id as string,
      titulo: s.titulo as string,
      colunas: s.colunas as number,
      cardTemplate: atual?.template ?? null,
      templateVersions: versions.map(({ versao, template }) => ({ versao, template })),
      items: itemsBySection.get(s.id as string) ?? [],
      aberturaTemplate: aberturaTemplateId ? (aberturaTemplatesById.get(aberturaTemplateId) ?? null) : null,
    };
  });

  return {
    data: {
      catalogNome: catalog.nome,
      paginaLargura: catalog.pagina_largura,
      paginaAltura: catalog.pagina_altura,
      pageTemplates,
      sections,
      paginasAvulsas,
    },
  };
}
