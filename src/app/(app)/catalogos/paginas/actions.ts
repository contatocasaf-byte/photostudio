"use server";

import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage/public-url";
import {
  defaultMargens,
  PAGE_FIELD_DEFS,
  type Margens,
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

// No máximo 1 page_template por (catalog_id, tipo) pros tipos "fixos"
// capa/continuacao — upsert por essa dupla em vez de por id (ver
// decisão na Parte 3 do plano: `tipo = "custom"`, pra override de
// página específica, fica de fora desta entrega — só faz sentido
// quando existir uma página gerada pelo motor de reflow, que ainda não
// existe). `abertura_secao` saiu dessa regra na Parte 15 — pode ter
// várias variantes por catálogo, ver getAberturaSecaoTemplate/
// saveAberturaSecaoTemplate abaixo, que operam por `id` da linha em
// vez de por (catalog_id, tipo).
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
): Promise<{ template?: (PageTemplateData & { fundoUrl: string | null }) | null; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data, error } = await supabase
    .from("page_templates")
    .select("header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json")
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

export async function savePageTemplate(catalogId: string, tipo: PageTipo, data: PageTemplateData): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const header: Partial<PageLayout> = {};
  const footer: Partial<PageLayout> = {};
  for (const def of PAGE_FIELD_DEFS) {
    if (!data.elementosHabilitados.includes(def.key)) continue;
    const target = def.zone === "header" ? header : footer;
    target[def.key] = data.layout[def.key];
  }

  const row = {
    header_json: header,
    footer_json: footer,
    margens: data.margens,
    fundo_key: data.fundoKey,
    fundo_pdf_key: data.fundoPdfKey,
    illustracoes_json: data.illustracoes,
    formas_json: data.formas,
  };

  const { data: existing, error: existingErr } = await supabase
    .from("page_templates")
    .select("id")
    .eq("catalog_id", catalogId)
    .eq("tipo", tipo)
    .maybeSingle();
  if (existingErr) return { error: existingErr.message };

  if (existing) {
    const { error } = await supabase.from("page_templates").update(row).eq("id", existing.id);
    if (error) return { error: error.message };
    return {};
  }

  const { error: insertErr } = await supabase.from("page_templates").insert({
    catalog_id: catalogId,
    tipo,
    is_default: true,
    ...row,
  });
  if (insertErr) return { error: insertErr.message };
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
  template: PageTemplateData & { fundoUrl: string | null };
};

export async function getAberturaSecaoTemplate(id: string): Promise<{ detail?: AberturaSecaoDetail; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("page_templates")
    .select("nome, header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json")
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
export async function saveAberturaSecaoTemplate(id: string, data: PageTemplateData): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const header: Partial<PageLayout> = {};
  const footer: Partial<PageLayout> = {};
  for (const def of PAGE_FIELD_DEFS) {
    if (!data.elementosHabilitados.includes(def.key)) continue;
    const target = def.zone === "header" ? header : footer;
    target[def.key] = data.layout[def.key];
  }

  const { error } = await supabase
    .from("page_templates")
    .update({
      header_json: header,
      footer_json: footer,
      margens: data.margens,
      fundo_key: data.fundoKey,
      fundo_pdf_key: data.fundoPdfKey,
      illustracoes_json: data.illustracoes,
      formas_json: data.formas,
    })
    .eq("id", id);
  if (error) return { error: error.message };
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
