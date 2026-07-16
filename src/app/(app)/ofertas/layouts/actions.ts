"use server";

import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

const PREFIX = "layouts/";

export type LayoutEntry = { key: string; name: string };

// Layouts são poucos e reutilizados entre várias ofertas/sessões — ao
// contrário das fotos de produto (planilha + pasta local, nunca sobem
// pro R2 nessa entrega), faz sentido persistir num prefixo próprio do
// bucket já usado pelo Studio.
export async function listLayouts(): Promise<{ layouts?: LayoutEntry[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão inválida." };

  const client = createR2Client();
  const command = new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: PREFIX });
  const res = await client.send(command);

  const layouts = (res.Contents ?? [])
    .map((obj) => obj.Key)
    .filter((key): key is string => !!key && key !== PREFIX)
    .map((key) => ({ key, name: key.slice(PREFIX.length) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { layouts };
}

export async function getLayoutUploadUrl(params: {
  fileName: string;
  contentType: string;
}): Promise<{ url?: string; key?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão inválida." };

  const safeName = params.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  const key = `${PREFIX}${safeName}`;

  const client = createR2Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: params.contentType,
  });
  const url = await getSignedUrl(client, command, { expiresIn: 300 });

  return { url, key };
}
