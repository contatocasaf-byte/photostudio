"use server";

import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage/public-url";
import {
  ALL_PAGE_COPY_PARTS,
  defaultMargens,
  PAGE_FIELD_DEFS,
  type Margens,
  type PageCopyPart,
  type PageFieldKey,
  type PageImageElementConfig,
  type PageIllustration,
  type PageLayout,
  type PageShape,
  type PageTipo,
} from "../core/pageConfig";

const ASSET_PREFIX = "catalogos/assets/";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Monta a linha (header_json/footer_json + margens/fundo/ilustrações/
// formas) a partir de PageTemplateData — extraído porque as 3 telas
// (capa, abertura de seção, continuação) fazem exatamente essa mesma
// montagem antes de gravar, e "replicar pras que seguem" (ver
// replicateToFollowers) precisa da MESMA linha calculada uma vez só.
function buildPageTemplateRow(data: PageTemplateData): Record<string, unknown> {
  const header: Partial<PageLayout> = {};
  const footer: Partial<PageLayout> = {};
  for (const def of PAGE_FIELD_DEFS) {
    if (!data.elementosHabilitados.includes(def.key)) continue;
    const target = def.zone === "header" ? header : footer;
    target[def.key] = data.layout[def.key];
  }
  return {
    header_json: header,
    footer_json: footer,
    margens: data.margens,
    fundo_key: data.fundoKey,
    fundo_pdf_key: data.fundoPdfKey,
    illustracoes_json: data.illustracoes,
    formas_json: data.formas,
  };
}

// Vínculo "este modelo segue aquele" (Fase 5, "Reaproveitar" +
// "seguir", pedido do usuário) — mesma mecânica já usada em
// sections.segue_secao_id/saveCardTemplate: ao salvar um modelo que
// tem outros modelos apontando pra ele (segue_template_id), o usuário
// pode optar por replicar a atualização pra cada seguidor. Cada
// seguidor guarda a PRÓPRIA lista de partes (PageCopyPart[], gravada
// no momento em que ele passou a seguir) — dois seguidores da mesma
// origem podem replicar partes diferentes. Partes não marcadas no
// seguidor ficam INTOCADAS (mescla por cima do header_json/footer_json
// já existente do seguidor, não sobrescreve o objeto inteiro — é por
// isso que os campos de header/footer são resolvidos aqui, e não só
// trocados por um "fieldsOnlyRow" pronto como antes). Uma coluna só
// (page_templates.segue_template_id) serve capa/abertura_secao/
// continuacao, já que são todas linhas da mesma tabela.
async function replicateToFollowers(supabase: SupabaseServerClient, templateId: string, data: PageTemplateData): Promise<{ error?: string }> {
  const { data: followers, error: followersErr } = await supabase
    .from("page_templates")
    .select("id, segue_campos, header_json, footer_json")
    .eq("segue_template_id", templateId);
  if (followersErr) return { error: followersErr.message };

  for (const follower of followers ?? []) {
    const campos = ((follower.segue_campos as PageCopyPart[] | null) ?? ALL_PAGE_COPY_PARTS) as PageCopyPart[];
    const update: Record<string, unknown> = {};

    const headerDefs = PAGE_FIELD_DEFS.filter((d) => d.zone === "header" && campos.includes(d.key));
    if (headerDefs.length > 0) {
      const mergedHeader = { ...(((follower.header_json as Record<string, unknown>) ?? {}) as Record<string, unknown>) };
      for (const def of headerDefs) {
        if (data.elementosHabilitados.includes(def.key)) mergedHeader[def.key] = data.layout[def.key];
        else delete mergedHeader[def.key];
      }
      update.header_json = mergedHeader;
    }

    const footerDefs = PAGE_FIELD_DEFS.filter((d) => d.zone === "footer" && campos.includes(d.key));
    if (footerDefs.length > 0) {
      const mergedFooter = { ...(((follower.footer_json as Record<string, unknown>) ?? {}) as Record<string, unknown>) };
      for (const def of footerDefs) {
        if (data.elementosHabilitados.includes(def.key)) mergedFooter[def.key] = data.layout[def.key];
        else delete mergedFooter[def.key];
      }
      update.footer_json = mergedFooter;
    }

    if (campos.includes("margens")) update.margens = data.margens;
    if (campos.includes("fundo")) {
      update.fundo_key = data.fundoKey;
      update.fundo_pdf_key = data.fundoPdfKey;
    }
    if (campos.includes("ilustracoes")) update.illustracoes_json = data.illustracoes;
    if (campos.includes("formas")) update.formas_json = data.formas;

    if (Object.keys(update).length === 0) continue;
    const { error } = await supabase.from("page_templates").update(update).eq("id", follower.id as string);
    if (error) return { error: error.message };
  }
  return {};
}

// Lista TODOS os modelos "reaproveitáveis" de um catálogo (capa +
// todas as variantes de abertura de seção + todas as de continuação)
// numa lista só — pedido do usuário: poder reaproveitar/seguir os
// campos de Banner de Título/Logo/Numeração/Contato/Validade entre
// QUALQUER um desses, não só dentro do mesmo tipo (antes, abertura só
// reaproveitava de outra abertura, e capa não tinha essa opção).
// "custom" (páginas avulsas) fica de fora — são one-off, sem sentido
// reaproveitável entre si (ver decisão original na Parte 12).
export type PageTemplateListItem = { id: string; label: string; segueTemplateId: string | null };

export async function listAllPageTemplates(catalogId: string): Promise<{ templates?: PageTemplateListItem[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("page_templates")
    .select("id, tipo, nome, segue_template_id")
    .eq("catalog_id", catalogId)
    .in("tipo", ["capa", "abertura_secao", "continuacao"])
    .order("criado_em", { ascending: true });
  if (error) return { error: error.message };
  return {
    templates: (data ?? []).map((row) => {
      const tipo = row.tipo as PageTipo;
      const nome = row.nome as string | null;
      const label = tipo === "capa" ? "Capa" : tipo === "abertura_secao" ? `Abertura — ${nome ?? "Sem nome"}` : `Continuação — ${nome ?? "Sem nome"}`;
      return { id: row.id as string, label, segueTemplateId: row.segue_template_id as string | null };
    }),
  };
}

// Campos completos de um modelo QUALQUER (capa/abertura/continuação)
// a partir só do id — usado por "Reaproveitar" agora que a origem pode
// ser de um tipo diferente do destino (getPageTemplate exige tipo+
// catalogId, getAberturaSecaoTemplate/getContinuacaoTemplate servem só
// o próprio tipo; isso aqui funciona pra qualquer um, mesma tabela).
export async function getPageTemplateFieldsById(
  id: string
): Promise<{ template?: PageTemplateData & { fundoUrl: string | null }; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("page_templates")
    .select("header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Modelo não encontrado." };

  const rawHeader = (data.header_json as Record<string, unknown>) ?? {};
  const layout = { ...rawHeader, ...((data.footer_json as object) ?? {}) } as PageLayout;
  let illustracoes = ((data.illustracoes_json as PageIllustration[] | null) ?? []) as PageIllustration[];
  const legacyIlustracao = rawHeader.ilustracao as PageImageElementConfig | undefined;
  if (illustracoes.length === 0 && legacyIlustracao) {
    illustracoes = [{ id: randomUUID(), ...legacyIlustracao }];
  }

  return {
    template: {
      layout,
      elementosHabilitados: Object.keys(layout).filter((k) => k !== "ilustracao") as PageFieldKey[],
      margens: data.margens as Margens,
      fundoKey: data.fundo_key as string | null,
      fundoPdfKey: data.fundo_pdf_key as string | null,
      fundoUrl: data.fundo_key ? getPublicUrl(data.fundo_key as string) : null,
      illustracoes,
      formas: ((data.formas_json as PageShape[] | null) ?? []) as PageShape[],
    },
  };
}

// No máximo 1 page_template por (catalog_id, tipo) só pro tipo "fixo"
// capa — upsert por essa dupla em vez de por id (ver decisão na Parte
// 3 do plano: `tipo = "custom"`, pra override de página específica,
// fica de fora desta entrega — só faz sentido quando existir uma
// página gerada pelo motor de reflow, que ainda não existe).
// `abertura_secao` saiu dessa regra na Parte 15, e `continuacao` pelo
// mesmo motivo depois — podem ter várias variantes por catálogo, ver
// getAberturaSecaoTemplate/saveAberturaSecaoTemplate e
// getContinuacaoTemplate/saveContinuacaoTemplate abaixo, que operam
// por `id` da linha em vez de por (catalog_id, tipo).
export type PageTemplateData = {
  layout: PageLayout;
  elementosHabilitados: PageFieldKey[];
  margens: Margens;
  fundoKey: string | null;
  // Upload de PDF como fundo (Fase 5, Parte 17) — chave do PDF ORIGINAL
  // no R2, null quando o fundo é uma imagem comum. fundoKey continua
  // apontando pra uma imagem sempre (o PNG rasterizado a partir do PDF
  // quando aplicável) — é o que o editor/preview desenham; fundoPdfKey
  // só é lido na hora de gerar o PDF final (ver pdfExport.ts).
  fundoPdfKey: string | null;
  illustracoes: PageIllustration[];
  formas: PageShape[];
};

export async function getPageTemplate(
  catalogId: string,
  tipo: PageTipo
): Promise<{
  template?: (PageTemplateData & { id: string; segueTemplateId: string | null; segueCampos: PageCopyPart[]; fundoUrl: string | null }) | null;
  error?: string;
}> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data, error } = await supabase
    .from("page_templates")
    .select("id, header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json, segue_template_id, segue_campos")
    .eq("catalog_id", catalogId)
    .eq("tipo", tipo)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { template: null };

  // header_json/footer_json batem com o schema já criado na Parte 1,
  // mas o estado do editor trabalha com um layout só (mesmo modelo
  // mental do card-molde) — a separação existe só na serialização.
  // Só campos HABILITADOS são gravados (ver savePageTemplate) —
  // ausência de uma key = campo desligado, daí dar pra derivar
  // elementosHabilitados direto das keys presentes.
  const rawHeader = (data.header_json as Record<string, unknown>) ?? {};
  const layout = { ...rawHeader, ...((data.footer_json as object) ?? {}) } as PageLayout;

  // Migração suave (Fase 5, Parte 13): "ilustracao" era 1 campo fixo,
  // virou lista sem limite. Card-molde salvo ANTES dessa parte ainda
  // tem esse campo solto em header_json — se a lista nova estiver
  // vazia, essa ilustração antiga vira o 1º item dela, sem precisar de
  // UPDATE nenhum aqui (só na próxima vez que o usuário salvar, o
  // campo antigo já nem é mais escrito de volta, ver savePageTemplate).
  let illustracoes = ((data.illustracoes_json as PageIllustration[] | null) ?? []) as PageIllustration[];
  const legacyIlustracao = rawHeader.ilustracao as PageImageElementConfig | undefined;
  if (illustracoes.length === 0 && legacyIlustracao) {
    illustracoes = [{ id: randomUUID(), ...legacyIlustracao }];
  }

  return {
    template: {
      id: data.id as string,
      segueTemplateId: data.segue_template_id as string | null,
      segueCampos: ((data.segue_campos as PageCopyPart[] | null) ?? ALL_PAGE_COPY_PARTS) as PageCopyPart[],
      layout,
      elementosHabilitados: Object.keys(layout).filter((k) => k !== "ilustracao") as PageFieldKey[],
      margens: data.margens as Margens,
      fundoKey: data.fundo_key,
      fundoPdfKey: data.fundo_pdf_key,
      fundoUrl: data.fundo_key ? getPublicUrl(data.fundo_key) : null,
      illustracoes,
      formas: ((data.formas_json as PageShape[] | null) ?? []) as PageShape[],
    },
  };
}

export async function savePageTemplate(
  catalogId: string,
  tipo: PageTipo,
  data: PageTemplateData,
  // Vínculo "este modelo segue aquele" (ver replicateToFollowers) —
  // null = não segue ninguém (ou parou de seguir). Decidido no
  // cliente: só != null quando o formulário, no momento do Salvar,
  // está idêntico ao que "Reaproveitar" acabou de copiar (qualquer
  // edição manual depois de copiar já quebra o vínculo antes de
  // chegar aqui — ver *Client.tsx).
  segueTemplateId: string | null = null,
  // Quais partes replicar (ver PageCopyPart acima) — só importa quando
  // segueTemplateId != null.
  segueCampos: PageCopyPart[] = ALL_PAGE_COPY_PARTS,
  // true = replica a atualização pros modelos que seguem este, cada um
  // nas PRÓPRIAS partes marcadas (ver replicateToFollowers).
  replicarParaSeguidoras: boolean = false
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const row = buildPageTemplateRow(data);

  const { data: existing, error: existingErr } = await supabase
    .from("page_templates")
    .select("id")
    .eq("catalog_id", catalogId)
    .eq("tipo", tipo)
    .maybeSingle();
  if (existingErr) return { error: existingErr.message };

  let templateId: string;
  if (existing) {
    templateId = existing.id as string;
    const { error } = await supabase
      .from("page_templates")
      .update({ ...row, segue_template_id: segueTemplateId, segue_campos: segueCampos })
      .eq("id", templateId);
    if (error) return { error: error.message };
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("page_templates")
      .insert({ catalog_id: catalogId, tipo, is_default: true, segue_template_id: segueTemplateId, segue_campos: segueCampos, ...row })
      .select("id")
      .single();
    if (insertErr) return { error: insertErr.message };
    templateId = inserted.id as string;
  }

  if (replicarParaSeguidoras) {
    const replicateErr = await replicateToFollowers(supabase, templateId, data);
    if (replicateErr.error) return replicateErr;
  }

  return {};
}

// Redimensionar o boundary da página no editor edita o tamanho do
// catálogo INTEIRO (compartilhado por todos os templates) — ação
// própria, separada do save do template.
export async function updateCatalogPageSize(catalogId: string, size: { largura: number; altura: number }): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase
    .from("catalogs")
    .update({ pagina_largura: size.largura, pagina_altura: size.altura })
    .eq("id", catalogId);
  if (error) return { error: error.message };
  return {};
}

// Variantes de "Abertura de Seção" (Fase 5, Parte 15) — ao contrário
// de capa/continuação (sempre 1 por catálogo, upsert-por-dupla acima),
// abertura_secao pode ter várias por catálogo, cada uma com `nome`
// próprio, cada seção escolhendo qual usar (ver
// sections.abertura_template_id/catalogs.abertura_secao_default_id em
// catalogos/actions.ts). Sem constraint de unicidade nova no banco —
// é 100% mudança de lógica de aplicação, por isso essas funções operam
// por `id` da linha em vez de por (catalog_id, tipo).
export type AberturaSecaoListItem = { id: string; nome: string; configurado: boolean };

export async function listAberturaSecaoTemplates(catalogId: string): Promise<{ templates?: AberturaSecaoListItem[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("page_templates")
    .select("id, nome, header_json, footer_json, fundo_key")
    .eq("catalog_id", catalogId)
    .eq("tipo", "abertura_secao")
    .order("criado_em", { ascending: true });
  if (error) return { error: error.message };
  return {
    templates: (data ?? []).map((row) => {
      const header = (row.header_json as Record<string, unknown>) ?? {};
      const footer = (row.footer_json as Record<string, unknown>) ?? {};
      return {
        id: row.id as string,
        nome: (row.nome as string | null) ?? "Sem nome",
        configurado: Object.keys(header).length > 0 || Object.keys(footer).length > 0 || !!row.fundo_key,
      };
    }),
  };
}

// Cria a linha já com um id (precisa pra abrir o editor na hora), mesmo
// espírito de createPaginaAvulsa — em branco até o primeiro Salvar.
export async function createAberturaSecaoTemplate(catalogId: string, nome: string): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome é obrigatório." };

  const { data: catalog, error: catalogErr } = await supabase
    .from("catalogs")
    .select("pagina_largura, pagina_altura")
    .eq("id", catalogId)
    .single();
  if (catalogErr) return { error: catalogErr.message };

  const { data, error } = await supabase
    .from("page_templates")
    .insert({
      catalog_id: catalogId,
      tipo: "abertura_secao",
      is_default: false,
      nome: trimmed,
      header_json: {},
      footer_json: {},
      margens: defaultMargens(catalog.pagina_largura, catalog.pagina_altura),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export type AberturaSecaoDetail = {
  id: string;
  nome: string;
  segueTemplateId: string | null;
  segueCampos: PageCopyPart[];
  template: PageTemplateData & { fundoUrl: string | null };
};

export async function getAberturaSecaoTemplate(id: string): Promise<{ detail?: AberturaSecaoDetail; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("page_templates")
    .select(
      "nome, header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json, segue_template_id, segue_campos"
    )
    .eq("id", id)
    .single();
  if (error) return { error: error.message };

  const rawHeader = (data.header_json as Record<string, unknown>) ?? {};
  const layout = { ...rawHeader, ...((data.footer_json as object) ?? {}) } as PageLayout;

  // Mesma migração suave de getPageTemplate (Parte 13) — variantes
  // criadas ANTES desta parte (a única linha abertura_secao que existia
  // por catálogo) podem ter uma ilustração antiga nunca migrada, se o
  // usuário não salvou de novo desde então.
  let illustracoes = ((data.illustracoes_json as PageIllustration[] | null) ?? []) as PageIllustration[];
  const legacyIlustracao = rawHeader.ilustracao as PageImageElementConfig | undefined;
  if (illustracoes.length === 0 && legacyIlustracao) {
    illustracoes = [{ id: randomUUID(), ...legacyIlustracao }];
  }

  return {
    detail: {
      id,
      nome: (data.nome as string | null) ?? "Sem nome",
      segueTemplateId: data.segue_template_id as string | null,
      segueCampos: ((data.segue_campos as PageCopyPart[] | null) ?? ALL_PAGE_COPY_PARTS) as PageCopyPart[],
      template: {
        layout,
        elementosHabilitados: Object.keys(layout).filter((k) => k !== "ilustracao") as PageFieldKey[],
        margens: data.margens as Margens,
        fundoKey: data.fundo_key,
        fundoPdfKey: data.fundo_pdf_key,
        fundoUrl: data.fundo_key ? getPublicUrl(data.fundo_key) : null,
        illustracoes,
        formas: ((data.formas_json as PageShape[] | null) ?? []) as PageShape[],
      },
    },
  };
}

// Já existe desde a criação (createAberturaSecaoTemplate) — sempre
// UPDATE por id, nunca upsert por (catalog_id, tipo).
export async function saveAberturaSecaoTemplate(
  id: string,
  data: PageTemplateData,
  segueTemplateId: string | null = null,
  segueCampos: PageCopyPart[] = ALL_PAGE_COPY_PARTS,
  replicarParaSeguidoras: boolean = false
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const row = buildPageTemplateRow(data);
  const { error } = await supabase
    .from("page_templates")
    .update({ ...row, segue_template_id: segueTemplateId, segue_campos: segueCampos })
    .eq("id", id);
  if (error) return { error: error.message };

  if (replicarParaSeguidoras) {
    const replicateErr = await replicateToFollowers(supabase, id, data);
    if (replicateErr.error) return replicateErr;
  }

  return {};
}

export async function updateAberturaSecaoNome(id: string, nome: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome é obrigatório." };
  const { error } = await supabase.from("page_templates").update({ nome: trimmed }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// sections.abertura_template_id e catalogs.abertura_secao_default_id
// são "on delete set null" — apagar aqui nunca deixa referência solta,
// só faz quem apontava pra essa variante voltar a herdar o padrão.
export async function deleteAberturaSecaoTemplate(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("page_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Variantes de "Continuação" — mesmo padrão de Abertura de Seção
// acima (Fase 5, Parte 15), aplicado depois à continuação por pedido
// do usuário: várias por catálogo, cada uma com `nome` próprio, cada
// seção escolhendo qual usar (ver sections.continuacao_template_id/
// catalogs.continuacao_default_id em catalogos/actions.ts). Sem
// constraint de unicidade nova no banco — mesma mudança 100% de lógica
// de aplicação, operando por `id` da linha em vez de por
// (catalog_id, tipo).
export type ContinuacaoListItem = { id: string; nome: string; configurado: boolean };

export async function listContinuacaoTemplates(catalogId: string): Promise<{ templates?: ContinuacaoListItem[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("page_templates")
    .select("id, nome, header_json, footer_json, fundo_key")
    .eq("catalog_id", catalogId)
    .eq("tipo", "continuacao")
    .order("criado_em", { ascending: true });
  if (error) return { error: error.message };
  return {
    templates: (data ?? []).map((row) => {
      const header = (row.header_json as Record<string, unknown>) ?? {};
      const footer = (row.footer_json as Record<string, unknown>) ?? {};
      return {
        id: row.id as string,
        nome: (row.nome as string | null) ?? "Sem nome",
        configurado: Object.keys(header).length > 0 || Object.keys(footer).length > 0 || !!row.fundo_key,
      };
    }),
  };
}

export async function createContinuacaoTemplate(catalogId: string, nome: string): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome é obrigatório." };

  const { data: catalog, error: catalogErr } = await supabase
    .from("catalogs")
    .select("pagina_largura, pagina_altura")
    .eq("id", catalogId)
    .single();
  if (catalogErr) return { error: catalogErr.message };

  const { data, error } = await supabase
    .from("page_templates")
    .insert({
      catalog_id: catalogId,
      tipo: "continuacao",
      is_default: false,
      nome: trimmed,
      header_json: {},
      footer_json: {},
      margens: defaultMargens(catalog.pagina_largura, catalog.pagina_altura),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export type ContinuacaoDetail = {
  id: string;
  nome: string;
  segueTemplateId: string | null;
  segueCampos: PageCopyPart[];
  template: PageTemplateData & { fundoUrl: string | null };
};

export async function getContinuacaoTemplate(id: string): Promise<{ detail?: ContinuacaoDetail; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("page_templates")
    .select(
      "nome, header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json, segue_template_id, segue_campos"
    )
    .eq("id", id)
    .single();
  if (error) return { error: error.message };

  const rawHeader = (data.header_json as Record<string, unknown>) ?? {};
  const layout = { ...rawHeader, ...((data.footer_json as object) ?? {}) } as PageLayout;

  let illustracoes = ((data.illustracoes_json as PageIllustration[] | null) ?? []) as PageIllustration[];
  const legacyIlustracao = rawHeader.ilustracao as PageImageElementConfig | undefined;
  if (illustracoes.length === 0 && legacyIlustracao) {
    illustracoes = [{ id: randomUUID(), ...legacyIlustracao }];
  }

  return {
    detail: {
      id,
      nome: (data.nome as string | null) ?? "Sem nome",
      segueTemplateId: data.segue_template_id as string | null,
      segueCampos: ((data.segue_campos as PageCopyPart[] | null) ?? ALL_PAGE_COPY_PARTS) as PageCopyPart[],
      template: {
        layout,
        elementosHabilitados: Object.keys(layout).filter((k) => k !== "ilustracao") as PageFieldKey[],
        margens: data.margens as Margens,
        fundoKey: data.fundo_key,
        fundoPdfKey: data.fundo_pdf_key,
        fundoUrl: data.fundo_key ? getPublicUrl(data.fundo_key) : null,
        illustracoes,
        formas: ((data.formas_json as PageShape[] | null) ?? []) as PageShape[],
      },
    },
  };
}

export async function saveContinuacaoTemplate(
  id: string,
  data: PageTemplateData,
  segueTemplateId: string | null = null,
  segueCampos: PageCopyPart[] = ALL_PAGE_COPY_PARTS,
  replicarParaSeguidoras: boolean = false
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const row = buildPageTemplateRow(data);
  const { error } = await supabase
    .from("page_templates")
    .update({ ...row, segue_template_id: segueTemplateId, segue_campos: segueCampos })
    .eq("id", id);
  if (error) return { error: error.message };

  if (replicarParaSeguidoras) {
    const replicateErr = await replicateToFollowers(supabase, id, data);
    if (replicateErr.error) return replicateErr;
  }

  return {};
}

export async function updateContinuacaoNome(id: string, nome: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = nome.trim();
  if (!trimmed) return { error: "Nome é obrigatório." };
  const { error } = await supabase.from("page_templates").update({ nome: trimmed }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// sections.continuacao_template_id e catalogs.continuacao_default_id
// são "on delete set null" — apagar aqui nunca deixa referência solta.
export async function deleteContinuacaoTemplate(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { error } = await supabase.from("page_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Assets de marca (ilustração/logo) sobem de verdade pro R2 — ao
// contrário da foto do card-molde (placeholder, sem produto ainda),
// aqui é um arquivo fixo preparado de antemão. Nome com UUID (não o
// nome original) pra nunca colidir entre uploads.
export async function getPageAssetUploadUrl(params: {
  fileName: string;
  contentType: string;
}): Promise<{ url?: string; key?: string; error?: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const dotIndex = params.fileName.lastIndexOf(".");
  const ext = dotIndex > 0 ? params.fileName.slice(dotIndex + 1) : "bin";
  const key = `${ASSET_PREFIX}${randomUUID()}.${ext}`;

  const client = createR2Client();
  const command = new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: params.contentType });
  const url = await getSignedUrl(client, command, { expiresIn: 300 });

  return { url, key };
}
