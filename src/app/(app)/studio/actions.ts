"use server";

import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

// Foto crua enviada pelo usuário, antes de qualquer processamento. A chave
// final com o código do produto (produtos/CODIGO_N.png) só é atribuída na
// Fase 2, pelo Renomeador — aqui a foto ainda não tem código associado.
export async function getUploadUrl(params: {
  fileName: string;
  contentType: string;
}): Promise<{ url?: string; filePath?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão inválida." };

  const dotIndex = params.fileName.lastIndexOf(".");
  const ext = dotIndex > 0 ? params.fileName.slice(dotIndex + 1) : "bin";
  const filePath = `uploads/${randomUUID()}.${ext}`;

  const client = createR2Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: filePath,
    ContentType: params.contentType,
  });
  const url = await getSignedUrl(client, command, { expiresIn: 300 });

  return { url, filePath };
}
