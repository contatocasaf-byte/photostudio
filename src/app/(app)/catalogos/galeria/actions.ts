"use server";

import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createDriveClient, getServiceAccountEmail } from "@/lib/googleDrive";
import type { GaleriaFile } from "../core/matchGaleriaFoto";

// Galeria de fotos via Google Drive (Fase 5, Parte 7) — configuração
// GLOBAL (não por catálogo), sempre uma linha só em `galeria_config`;
// salvar = apagar+inserir. Reaproveita a mesma service account já
// configurada pro Cadência CRM (ver src/lib/googleDrive.ts) — o
// usuário só precisa compartilhar a pasta nova com esse e-mail.

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Aceita tanto um link colado (`.../drive/folders/ID` ou `...?id=ID`)
// quanto o ID puro, já que o usuário pode copiar qualquer um dos dois
// direto da barra de endereço do Drive.
function extractDriveFolderId(input: string): string {
  const trimmed = input.trim();
  const pathMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];
  return trimmed;
}

async function listAllImagesInFolder(folderId: string): Promise<GaleriaFile[]> {
  const drive = createDriveClient();
  const mimeQuery = IMAGE_MIME_TYPES.map((t) => `mimeType = '${t}'`).join(" or ");
  const q = `'${folderId}' in parents and trashed = false and (${mimeQuery})`;

  const files: GaleriaFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) files.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function getGaleriaConfig(): Promise<{
  folderId?: string | null;
  serviceAccountEmail?: string;
  error?: string;
}> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data, error } = await supabase
    .from("galeria_config")
    .select("drive_folder_id")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };

  let serviceAccountEmail = "";
  try {
    serviceAccountEmail = getServiceAccountEmail();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao ler credencial da service account." };
  }

  return { folderId: data?.drive_folder_id ?? null, serviceAccountEmail };
}

// Lista ao vivo (sem cache, sem salvar) — pro botão "Testar conexão"
// confirmar que a pasta existe e está compartilhada com a service
// account ANTES do usuário salvar uma pasta errada/inacessível.
export async function testGaleriaConnection(folderIdOrUrl: string): Promise<{ ok?: boolean; count?: number; error?: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const folderId = extractDriveFolderId(folderIdOrUrl);
  if (!folderId) return { error: "Informe o link ou o ID da pasta." };

  try {
    const files = await listAllImagesInFolder(folderId);
    return { ok: true, count: files.length };
  } catch {
    // Erro mais comum aqui é 403/404 — pasta não compartilhada com a
    // service account, ou ID errado. Mensagem genérica é suficiente
    // pro usuário entender o que conferir.
    return { error: "Não foi possível acessar essa pasta — confirme o link e se ela foi compartilhada com o e-mail da service account." };
  }
}

export async function saveGaleriaConfig(folderIdOrUrl: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const folderId = extractDriveFolderId(folderIdOrUrl);
  if (!folderId) return { error: "Informe o link ou o ID da pasta." };

  // Singleton: sempre uma linha só — apaga tudo, insere a nova.
  const { error: deleteErr } = await supabase.from("galeria_config").delete().not("id", "is", null);
  if (deleteErr) return { error: deleteErr.message };

  const { error: insertErr } = await supabase.from("galeria_config").insert({ drive_folder_id: folderId });
  if (insertErr) return { error: insertErr.message };

  return {};
}

// Listagem cacheada (90s, mesmo padrão já validado no Cadência CRM) —
// evita bater na API do Drive a cada carregamento do preview, mas
// ainda reflete foto nova/removida em menos de 2 minutos sem nenhuma
// ação manual no app.
const listImagesCached = unstable_cache(
  async (folderId: string) => listAllImagesInFolder(folderId),
  ["galeria-drive-images"],
  { revalidate: 90 }
);

export async function listGaleriaImages(): Promise<{ files?: GaleriaFile[]; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const { data, error } = await supabase
    .from("galeria_config")
    .select("drive_folder_id")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data?.drive_folder_id) return { files: [] };

  try {
    const files = await listImagesCached(data.drive_folder_id);
    return { files };
  } catch {
    return { error: "Falha ao listar fotos da galeria." };
  }
}
