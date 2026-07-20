"use server";

import { createClient } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage/public-url";
import { defaultMargens, PAGE_FIELD_DEFS, type Margens, type PageFieldKey, type PageLayout, type PageShape } from "../core/pageConfig";
import type { PageTemplateData } from "../paginas/actions";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Página avulsa entre seções (Fase 5, Parte 12) — um page_templates
// tipo='custom' criado SÓ pra ela (não reutilizável, ao contrário dos
// 3 slots fixos capa/abertura_secao/continuacao) e uma linha em
// paginas_avulsas guardando título + âncora (apos_secao_id, null =
// antes de tudo) + posição entre outras avulsas na mesma âncora.
export type PaginaAvulsaListItem = {
  id: string;
  titulo: string;
  aposSecaoId: string | null;
  ordem: number;
};

export async function listPaginasAvulsas(catalogId: string): Promise<{ avulsas?: PaginaAvulsaListItem[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data, error } = await supabase
    .from("paginas_avulsas")
    .select("id, titulo, apos_secao_id, ordem")
    .eq("catalog_id", catalogId)
    .order("ordem", { ascending: true });
  if (error) return { error: error.message };
  return {
    avulsas: (data ?? []).map((r) => ({
      id: r.id as string,
      titulo: r.titulo as string,
      aposSecaoId: r.apos_secao_id as string | null,
      ordem: r.ordem as number,
    })),
  };
}

// Cria o page_templates (tipo='custom', em branco) e a linha de
// paginas_avulsas juntos — diferente dos 3 slots fixos (que só ganham
// uma linha de page_templates no primeiro Salvar), a avulsa precisa de
// um id de template pra abrir o editor já na criação.
export async function createPaginaAvulsa(
  catalogId: string,
  titulo: string,
  aposSecaoId: string | null
): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = titulo.trim();
  if (!trimmed) return { error: "Título é obrigatório." };

  const { data: catalog, error: catalogErr } = await supabase
    .from("catalogs")
    .select("pagina_largura, pagina_altura")
    .eq("id", catalogId)
    .single();
  if (catalogErr) return { error: catalogErr.message };

  // Próxima posição dentro do mesmo grupo (mesmo catálogo + mesma
  // âncora) — cada âncora tem sua própria sequência independente.
  let ordemQuery = supabase
    .from("paginas_avulsas")
    .select("ordem")
    .eq("catalog_id", catalogId)
    .order("ordem", { ascending: false })
    .limit(1);
  ordemQuery = aposSecaoId === null ? ordemQuery.is("apos_secao_id", null) : ordemQuery.eq("apos_secao_id", aposSecaoId);
  const { data: existing, error: existingErr } = await ordemQuery;
  if (existingErr) return { error: existingErr.message };
  const nextOrdem = (existing?.[0]?.ordem ?? -1) + 1;

  const { data: template, error: templateErr } = await supabase
    .from("page_templates")
    .insert({
      catalog_id: catalogId,
      tipo: "custom",
      is_default: false,
      header_json: {},
      footer_json: {},
      margens: defaultMargens(catalog.pagina_largura, catalog.pagina_altura),
    })
    .select("id")
    .single();
  if (templateErr) return { error: templateErr.message };

  const { data: avulsa, error: avulsaErr } = await supabase
    .from("paginas_avulsas")
    .insert({ catalog_id: catalogId, titulo: trimmed, apos_secao_id: aposSecaoId, ordem: nextOrdem, page_template_id: template.id })
    .select("id")
    .single();
  if (avulsaErr) return { error: avulsaErr.message };

  return { id: avulsa.id };
}

export type PaginaAvulsaDetail = {
  id: string;
  titulo: string;
  catalogId: string;
  template: PageTemplateData & { fundoUrl: string | null };
};

export async function getPaginaAvulsa(id: string): Promise<{ avulsa?: PaginaAvulsaDetail; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data: avulsa, error: avulsaErr } = await supabase
    .from("paginas_avulsas")
    .select("id, titulo, catalog_id, page_template_id")
    .eq("id", id)
    .single();
  if (avulsaErr) return { error: avulsaErr.message };

  const { data: template, error: templateErr } = await supabase
    .from("page_templates")
    .select("header_json, footer_json, margens, fundo_key, fundo_pdf_key, illustracoes_json, formas_json")
    .eq("id", avulsa.page_template_id)
    .single();
  if (templateErr) return { error: templateErr.message };

  const layout = {
    ...((template.header_json as Partial<PageLayout>) ?? {}),
    ...((template.footer_json as Partial<PageLayout>) ?? {}),
  } as PageLayout;

  return {
    avulsa: {
      id: avulsa.id as string,
      titulo: avulsa.titulo as string,
      catalogId: avulsa.catalog_id as string,
      template: {
        layout,
        elementosHabilitados: Object.keys(layout) as PageFieldKey[],
        margens: template.margens as Margens,
        fundoKey: template.fundo_key,
        fundoPdfKey: template.fundo_pdf_key,
        fundoUrl: template.fundo_key ? getPublicUrl(template.fundo_key) : null,
        // Avulsas são todas criadas depois da Parte 13 (sem legado pra
        // migrar, diferente dos 3 slots fixos que já existiam antes) —
        // só lê o que já estiver salvo.
        illustracoes: (template.illustracoes_json ?? []) as PageTemplateData["illustracoes"],
        formas: ((template.formas_json as PageShape[] | null) ?? []) as PageShape[],
      },
    },
  };
}

// Salva o design da avulsa — o page_templates já existe desde a
// criação (createPaginaAvulsa), então é sempre UPDATE, nunca upsert
// por (catalog_id, tipo) como nos 3 slots fixos.
export async function savePaginaAvulsaTemplate(id: string, data: PageTemplateData): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data: avulsa, error: avulsaErr } = await supabase
    .from("paginas_avulsas")
    .select("page_template_id")
    .eq("id", id)
    .single();
  if (avulsaErr) return { error: avulsaErr.message };

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
    .eq("id", avulsa.page_template_id);
  if (error) return { error: error.message };
  return {};
}

export async function updatePaginaAvulsaTitulo(id: string, titulo: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = titulo.trim();
  if (!trimmed) return { error: "Título é obrigatório." };
  const { error } = await supabase.from("paginas_avulsas").update({ titulo: trimmed }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Apaga só o page_templates — paginas_avulsas cai junto via "on delete
// cascade" (ver schema): a página avulsa não existe sem o template que
// só ela usa, então não faz sentido um sobreviver sem o outro.
export async function deletePaginaAvulsa(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const { data: avulsa, error: avulsaErr } = await supabase.from("paginas_avulsas").select("page_template_id").eq("id", id).single();
  if (avulsaErr) return { error: avulsaErr.message };
  const { error } = await supabase.from("page_templates").delete().eq("id", avulsa.page_template_id);
  if (error) return { error: error.message };
  return {};
}

// Troca a posição de duas avulsas da MESMA âncora (setas ↑/↓ na UI) —
// grupo pequeno o bastante (poucas avulsas entre duas seções) pra não
// precisar de drag-and-drop, só um swap simples.
export async function swapPaginaAvulsaOrdem(
  idA: string,
  ordemA: number,
  idB: string,
  ordemB: number
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };
  const [ra, rb] = await Promise.all([
    supabase.from("paginas_avulsas").update({ ordem: ordemB }).eq("id", idA),
    supabase.from("paginas_avulsas").update({ ordem: ordemA }).eq("id", idB),
  ]);
  if (ra.error) return { error: ra.error.message };
  if (rb.error) return { error: rb.error.message };
  return {};
}
