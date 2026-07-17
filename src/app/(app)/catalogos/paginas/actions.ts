"use server";

import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";
import { PAGE_FIELD_DEFS, type Margens, type PageFieldKey, type PageLayout, type PageTipo } from "../core/pageConfig";

const ASSET_PREFIX = "catalogos/assets/";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// No máximo 1 page_template por (catalog_id, tipo) pros 3 tipos
// "fixos" (capa/abertura_secao/continuacao) — upsert por essa dupla
// em vez de por id (ver decisão na Parte 3 do plano: `tipo = "custom"`,
// pra override de página específica, fica de fora desta entrega — só
// faz sentido quando existir uma página gerada pelo motor de reflow,
// que ainda não existe).
export type PageTemplateData = {
  layout: PageLayout;
  elementosHabilitados: PageFieldKey[];
  margens: Margens;
};

export async function getPageTemplate(
  catalogId: string,
  tipo: PageTipo
): Promise<{ template?: PageTemplateData | null; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data, error } = await supabase
    .from("page_templates")
    .select("header_json, footer_json, margens")
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
  const layout = {
    ...((data.header_json as Partial<PageLayout>) ?? {}),
    ...((data.footer_json as Partial<PageLayout>) ?? {}),
  } as PageLayout;

  return { template: { layout, elementosHabilitados: Object.keys(layout) as PageFieldKey[], margens: data.margens as Margens } };
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

  const row = { header_json: header, footer_json: footer, margens: data.margens };

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
