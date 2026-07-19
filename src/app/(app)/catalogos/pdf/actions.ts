"use server";

import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

const PDF_TEMP_PREFIX = "catalogos/pdf-temp/";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Fotos de produto (Google Drive, fora do R2) precisam de uma cópia
// temporária no bucket antes de gerar o PDF (Fase 5, Parte 10) — o
// backend Python não ganha credencial nova do Drive, só continua
// falando com R2 via chave, igual a tudo mais que ele já faz. Sem
// nome original (o blob vem da rota-proxy da galeria, não de um
// input de arquivo) — extensão derivada do content-type.
export async function getCatalogPdfPhotoUploadUrl(params: { contentType: string }): Promise<{ url?: string; key?: string; error?: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Sessão inválida." };

  const ext = EXT_BY_CONTENT_TYPE[params.contentType] ?? "bin";
  const key = `${PDF_TEMP_PREFIX}${randomUUID()}.${ext}`;

  const client = createR2Client();
  const command = new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: params.contentType });
  const url = await getSignedUrl(client, command, { expiresIn: 300 });

  return { url, key };
}
