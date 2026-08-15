"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import type { CardBorda, CardFieldKey, CardLayout, CardShape } from "./core/cardConfig";
import {
  getCatalogTipo,
  getSectionCatalogTipo,
  permissaoParaAcao,
  type AcaoCatalogo,
  type CatalogTipo,
  type SupabaseServerClient,
} from "./core/permissoes";

// Primeiro módulo da suite que lê/escreve Postgres além de autenticação
// (Studio e Ofertas usam só R2) — ver esquema em
// supabase/catalogos_schema.sql (rodado manualmente uma vez no Supabase).

// Jornal de Ofertas (pedido do usuário) É um `catalogs` com
// tipo='jornal_ofertas' — reaproveita 100% de sections/card_templates/
// page_templates/planilhas, só muda em capa opcional (já era assim pra
// catálogo comum, sem coluna nova) e período de validade
// (validade_inicio/validade_fim). Permissões são PRÓPRIAS e separadas
// das de catálogo (ver permissaoParaAcao em ./core/permissoes.ts) —
// mesmas telas, ações diferentes conforme o tipo do catálogo pai.
// `CatalogTipo` NÃO é re-exportado daqui: um arquivo "use server" só
// pode exportar funções async (o compilador do Next falha em build
// pra qualquer outro tipo de export, mesmo um `export type` de
// re-exportação) — quem precisar do tipo importa direto de
// ./core/permissoes.

export type Catalog = {
  id: string;
  nome: string;
  criado_em: string;
  tipo: CatalogTipo;
  sectionCount: number;
};

export type Section = {
  id: string;
  catalog_id: string;
  numero: string | null;
  titulo: string;
  ordem: number;
  colunas: number;
  // Qual variante de "Abertura de Seção" esta seção usa (Fase 5, Parte
  // 15) — null = herda o padrão do catálogo (catalogs.abertura_secao_default_id).
  abertura_template_id: string | null;
  // Mesma ideia pra "Continuação" — null = herda catalogs.continuacao_default_id.
  continuacao_template_id: string | null;
  // Seção cujo card-molde esta seção "segue" — quando a origem salva
  // com "replicar", uma versão nova é criada aqui também. Setado só
  // via saveCardTemplate (nunca em createSection/updateSection).
  segue_secao_id: string | null;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Checagem de permissão DENTRO da action (não só escondendo o botão na
// tela) — mesmo padrão já usado nas actions de planilhas
// (deletePlanilha/atualizarPlanilha). Ação genérica (independente de
// catálogo/jornal) mapeada pra chave certa via permissaoParaAcao
// (./core/permissoes.ts) conforme o `tipo` do catalogs pai.
async function requirePermissaoAcao(tipo: CatalogTipo, acao: AcaoCatalogo): Promise<string | null> {
  const access = await getCurrentAccess();
  if (!temPermissao(access, permissaoParaAcao(tipo, acao))) return "Sem permissão pra essa ação.";
  return null;
}

export async function listCatalogs(tipo: CatalogTipo = "catalogo"): Promise<{ catalogs?: Catalog[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const [catalogsRes, sectionsRes] = await Promise.all([
    supabase.from("catalogs").select("id, nome, criado_em").eq("tipo", tipo).order("criado_em", { ascending: false }),
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
    tipo,
    sectionCount: counts.get(c.id as string) ?? 0,
  }));

  return { catalogs };
}

export async function createCatalog(nome: string, tipo: CatalogTipo = "catalogo"): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const permErr = await requirePermissaoAcao(tipo, "criar");
  if (permErr) return { error: permErr };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome do catálogo é obrigatório." };

  const { data, error } = await supabase.from("catalogs").insert({ nome: trimmed, tipo }).select("id").single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function renameCatalog(id: string, nome: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const tipo = await getCatalogTipo(supabase, id);
  const permErr = await requirePermissaoAcao(tipo, "editar");
  if (permErr) return { error: permErr };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome do catálogo é obrigatório." };

  const { error } = await supabase
    .from("catalogs")
    .update({ nome: trimmed, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Só faz sentido pra Jornal de Ofertas (prazo de validade) — mesma
// permissão de "editar" catálogo/jornal, sem checagem extra de tipo:
// chamar isso num catálogo comum é inofensivo (grava datas que a UI
// nunca lê pra esse tipo), não vale a pena bloquear.
export async function setCatalogValidade(catalogId: string, validadeInicio: string | null, validadeFim: string | null): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const tipo = await getCatalogTipo(supabase, catalogId);
  const permErr = await requirePermissaoAcao(tipo, "editar");
  if (permErr) return { error: permErr };

  const { error } = await supabase
    .from("catalogs")
    .update({ validade_inicio: validadeInicio, validade_fim: validadeFim })
    .eq("id", catalogId);
  if (error) return { error: error.message };
  return {};
}

export async function deleteCatalog(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const tipo = await getCatalogTipo(supabase, id);
  const permErr = await requirePermissaoAcao(tipo, "excluir");
  if (permErr) return { error: permErr };
  const { error } = await supabase.from("catalogs").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export type CatalogDetail = {
  id: string;
  nome: string;
  tipo: CatalogTipo;
  paginaLargura: number;
  paginaAltura: number;
  planilhaId: string | null;
  // Variante de "Abertura de Seção" usada por padrão quando a seção
  // não escolhe uma própria (Fase 5, Parte 15).
  aberturaSecaoDefaultId: string | null;
  // Mesma ideia pra "Continuação".
  continuacaoDefaultId: string | null;
  // Só usado quando tipo="jornal_ofertas" — período de validade do
  // jornal (formato YYYY-MM-DD, direto de <input type="date">).
  validadeInicio: string | null;
  validadeFim: string | null;
};

export async function getCatalog(id: string): Promise<{ catalog?: CatalogDetail; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("catalogs")
    .select(
      "id, nome, tipo, pagina_largura, pagina_altura, planilha_id, abertura_secao_default_id, continuacao_default_id, validade_inicio, validade_fim"
    )
    .eq("id", id)
    .single();
  if (error) return { error: error.message };
  return {
    catalog: {
      id: data.id,
      nome: data.nome,
      tipo: data.tipo as CatalogTipo,
      paginaLargura: data.pagina_largura,
      paginaAltura: data.pagina_altura,
      planilhaId: data.planilha_id,
      aberturaSecaoDefaultId: data.abertura_secao_default_id,
      continuacaoDefaultId: data.continuacao_default_id,
      validadeInicio: data.validade_inicio,
      validadeFim: data.validade_fim,
    },
  };
}

// Padrão do catálogo pra "Abertura de Seção" (Fase 5, Parte 15) — vale
// pra toda seção que não escolher uma variante própria. templateId=null
// remove o padrão (nenhuma seção sem escolha própria mostra abertura).
export async function setCatalogAberturaDefault(catalogId: string, templateId: string | null): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("catalogs").update({ abertura_secao_default_id: templateId }).eq("id", catalogId);
  if (error) return { error: error.message };
  return {};
}

// Mesma ideia pra "Continuação".
export async function setCatalogContinuacaoDefault(catalogId: string, templateId: string | null): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("catalogs").update({ continuacao_default_id: templateId }).eq("id", catalogId);
  if (error) return { error: error.message };
  return {};
}

export async function getSection(id: string): Promise<{ section?: Section; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("sections")
    .select("id, catalog_id, numero, titulo, ordem, colunas, abertura_template_id, continuacao_template_id, segue_secao_id")
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
    .select("id, catalog_id, numero, titulo, ordem, colunas, abertura_template_id, continuacao_template_id, segue_secao_id")
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
  aberturaTemplateId?: string | null;
  continuacaoTemplateId?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const tipo = await getCatalogTipo(supabase, params.catalogId);
  const permErr = await requirePermissaoAcao(tipo, "criar_secoes");
  if (permErr) return { error: permErr };
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
      abertura_template_id: params.aberturaTemplateId ?? null,
      continuacao_template_id: params.continuacaoTemplateId ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function updateSection(
  id: string,
  patch: {
    numero?: string;
    titulo?: string;
    colunas?: number;
    aberturaTemplateId?: string | null;
    continuacaoTemplateId?: string | null;
  }
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const tipo = await getSectionCatalogTipo(supabase, id);
  const permErr = await requirePermissaoAcao(tipo, "editar_secoes");
  if (permErr) return { error: permErr };

  const update: Record<string, unknown> = {};
  if (patch.numero !== undefined) update.numero = patch.numero.trim() || null;
  if (patch.titulo !== undefined) {
    const titulo = patch.titulo.trim();
    if (!titulo) return { error: "Título da seção é obrigatório." };
    update.titulo = titulo;
  }
  if (patch.colunas !== undefined) update.colunas = Math.max(1, patch.colunas);
  if (patch.aberturaTemplateId !== undefined) update.abertura_template_id = patch.aberturaTemplateId;
  if (patch.continuacaoTemplateId !== undefined) update.continuacao_template_id = patch.continuacaoTemplateId;

  const { error } = await supabase.from("sections").update(update).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteSection(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const tipo = await getSectionCatalogTipo(supabase, id);
  const permErr = await requirePermissaoAcao(tipo, "excluir_secoes");
  if (permErr) return { error: permErr };
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Reordenar é tratado como "editar seções" (muda ordem, não cria/apaga
// nada) — mesma permissão de updateSection.
export async function reorderSections(orderedIds: string[]): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  if (orderedIds.length === 0) return {};
  // Reordenar só acontece dentro da lista de seções de UM catálogo —
  // basta olhar o tipo do catálogo da primeira seção do lote.
  const tipo = await getSectionCatalogTipo(supabase, orderedIds[0]);
  const permErr = await requirePermissaoAcao(tipo, "editar_secoes");
  if (permErr) return { error: permErr };

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

// Card-molde de uma seção (Fase 5, Parte 2; versionamento na Parte 8).
// Enquanto a seção não tem produto posicionado, salvar continua sendo
// um UPDATE na mesma linha (ou INSERT na primeira vez) — sem gerar
// versão nova à toa enquanto o usuário ainda está iterando no design.
// Só passa a versionar de verdade (spec seção 3.5, "aplicar a todos
// vs. só novos") a partir do primeiro produto posicionado na seção —
// ver `SaveCardTemplateMode` e `saveCardTemplate`.
export type SaveCardTemplateMode = "aplicar_todos" | "aplicar_novos";

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

// Aplica uma linha de card-molde (já resolvida a partir de
// CardTemplateData) a UMA seção — extraído pra ser reaproveitado tanto
// pra seção que está sendo editada quanto, em "replicar pras
// seguidoras" (ver saveCardTemplate), pra cada seção que segue ela.
// Mesma regra de sempre: sem produto posicionado ainda, UPDATE in
// place; com produto posicionado, sempre INSERT versão nova.
async function applyCardTemplateRow(
  supabase: SupabaseServerClient,
  targetSectionId: string,
  row: Record<string, unknown>,
  modo: SaveCardTemplateMode
): Promise<{ error?: string }> {
  const { data: existing, error: existingErr } = await supabase
    .from("card_templates")
    .select("id, versao")
    .eq("section_id", targetSectionId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) return { error: existingErr.message };

  if (!existing) {
    const { data: inserted, error: insertErr } = await supabase
      .from("card_templates")
      .insert({ section_id: targetSectionId, ...row })
      .select("id")
      .single();
    if (insertErr) return { error: insertErr.message };

    const { error: linkErr } = await supabase.from("sections").update({ card_template_id: inserted.id }).eq("id", targetSectionId);
    if (linkErr) return { error: linkErr.message };
    return {};
  }

  const { data: itemRows, error: itemsErr } = await supabase.from("catalog_items").select("id").eq("section_id", targetSectionId).limit(1);
  if (itemsErr) return { error: itemsErr.message };
  const hasItems = (itemRows?.length ?? 0) > 0;

  if (!hasItems) {
    const { error } = await supabase.from("card_templates").update(row).eq("id", existing.id);
    if (error) return { error: error.message };
    return {};
  }

  const proximaVersao = (existing.versao as number) + 1;
  const { data: inserted, error: insertErr } = await supabase
    .from("card_templates")
    .insert({ section_id: targetSectionId, versao: proximaVersao, ...row })
    .select("id")
    .single();
  if (insertErr) return { error: insertErr.message };

  const { error: linkErr } = await supabase.from("sections").update({ card_template_id: inserted.id }).eq("id", targetSectionId);
  if (linkErr) return { error: linkErr.message };

  if (modo === "aplicar_todos") {
    const { error: migrateErr } = await supabase
      .from("catalog_items")
      .update({ card_template_versao: proximaVersao })
      .eq("section_id", targetSectionId);
    if (migrateErr) return { error: migrateErr.message };
  }

  return {};
}

export async function saveCardTemplate(
  sectionId: string,
  data: CardTemplateData,
  modo: SaveCardTemplateMode = "aplicar_todos",
  // Vínculo "esta seção segue aquela" (ver Section.segue_secao_id) —
  // null = não segue ninguém (ou parou de seguir). Decidido no
  // cliente: só fica != null quando o formulário, no momento do
  // Salvar, está idêntico ao que "Reaproveitar de outra seção" acabou
  // de copiar (qualquer edição manual depois de copiar já quebra o
  // vínculo antes mesmo de chegar aqui — ver CardEditorClient.tsx).
  segueSecaoId: string | null = null,
  // true = replica essa mesma alteração (a mesma `row`) pras seções
  // que seguem `sectionId`, cada uma recebendo sua PRÓPRIA versão nova
  // (nunca a mesma linha compartilhada). Sempre em modo "aplicar_todos"
  // pra cada seguidora — seguir significa ficar visualmente idêntica,
  // não faz sentido a seguidora ganhar produtos "no molde antigo".
  replicarParaSeguidoras: boolean = false
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const tipo = await getSectionCatalogTipo(supabase, sectionId);
  const permErr = await requirePermissaoAcao(tipo, "card_molde");
  if (permErr) return { error: permErr };

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

  const applyErr = await applyCardTemplateRow(supabase, sectionId, row, modo);
  if (applyErr.error) return applyErr;

  const { error: followErr } = await supabase.from("sections").update({ segue_secao_id: segueSecaoId }).eq("id", sectionId);
  if (followErr) return { error: followErr.message };

  if (replicarParaSeguidoras) {
    const { data: followers, error: followersErr } = await supabase.from("sections").select("id").eq("segue_secao_id", sectionId);
    if (followersErr) return { error: followersErr.message };

    for (const follower of followers ?? []) {
      const followerErr = await applyCardTemplateRow(supabase, follower.id as string, row, "aplicar_todos");
      if (followerErr.error) return followerErr;
    }
  }

  return {};
}

export type CardTemplateVersion = {
  id: string;
  versao: number;
  criadoEm: string;
  template: CardTemplateData;
};

// Restaurar uma versão antiga (Fase 5, Parte 9) não precisa de
// persistência própria — "restaurar" é só carregar os dados de uma
// versão antiga no estado local do editor (mesma mecânica de
// "Reaproveitar de outra seção") e deixar o Salvar de sempre criar a
// versão nova a partir daí. Essa função só lista o que existe.
export async function listCardTemplateVersions(sectionId: string): Promise<{ versions?: CardTemplateVersion[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data, error } = await supabase
    .from("card_templates")
    .select(
      "id, versao, criado_em, layout_json, largura, altura_minima, altura_cresce_com, campos_habilitados, gutter_x, gutter_y, shapes_json, borda_json"
    )
    .eq("section_id", sectionId)
    .order("versao", { ascending: false });
  if (error) return { error: error.message };

  const versions = (data ?? []).map((row) => ({
    id: row.id as string,
    versao: row.versao as number,
    criadoEm: row.criado_em as string,
    template: {
      layout: row.layout_json as CardLayout,
      largura: row.largura,
      alturaMinima: row.altura_minima,
      alturaCresceCom: row.altura_cresce_com as CardFieldKey | null,
      camposHabilitados: (row.campos_habilitados ?? []) as CardFieldKey[],
      gutterX: row.gutter_x,
      gutterY: row.gutter_y,
      shapes: (row.shapes_json ?? []) as CardShape[],
      borda: row.borda_json as CardBorda,
    },
  }));

  return { versions };
}
