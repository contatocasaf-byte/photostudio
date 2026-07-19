"use server";

import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, R2_BUCKET_NAME } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

const PREFIX = "fontes/";
const FONT_EXTS = [".ttf", ".otf", ".woff", ".woff2"];

// Convenção de nome (sem tabela nova no Postgres, mesma ideia do
// prefixo layouts/): "Nome Da Familia-Peso.ext", ex.
// "Montserrat-Bold.ttf". Peso reconhecido por número (400/700) ou
// pelas palavras Regular/Bold — o que vier depois do último "-".
//
// Promovido de ofertas/fonts/ (Fase 5, Parte 11 do Criador de
// Catálogos) — sem escopo nenhum por módulo (só "está logado"), então
// uma fonte enviada por qualquer um dos dois já aparece pro outro.
const WEIGHT_WORDS: Record<string, number> = { regular: 400, normal: 400, bold: 700 };

export type CustomFontEntry = { key: string; family: string; weight: number; url: string };

function parseFontKey(key: string): CustomFontEntry | null {
  const fileName = key.slice(PREFIX.length);
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return null;
  const base = fileName.slice(0, dot);
  const dash = base.lastIndexOf("-");
  if (dash <= 0) return null;

  const family = base.slice(0, dash).replace(/_/g, " ").trim();
  const weightRaw = base.slice(dash + 1).toLowerCase();
  const weight = /^\d+$/.test(weightRaw) ? Number(weightRaw) : WEIGHT_WORDS[weightRaw];
  if (!family || !weight) return null;

  return { key, family, weight, url: "" };
}

// Fontes próprias do usuário (upload) — ao contrário das Google Fonts
// curadas (ver googleFonts.ts, carregadas direto do CDN do Google,
// nunca armazenadas), essas ficam no mesmo bucket dos layouts, prefixo
// próprio.
export async function listFonts(): Promise<{ fonts?: CustomFontEntry[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão inválida." };

  const client = createR2Client();
  const command = new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: PREFIX });
  const res = await client.send(command);

  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  const fonts = (res.Contents ?? [])
    .map((obj) => obj.Key)
    .filter((key): key is string => !!key && key !== PREFIX && FONT_EXTS.some((ext) => key.toLowerCase().endsWith(ext)))
    .map(parseFontKey)
    .filter((f): f is CustomFontEntry => f !== null)
    .map((f) => ({ ...f, url: `${publicBase}/${f.key}` }))
    .sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight);

  return { fonts };
}

export async function getFontUploadUrl(params: {
  family: string;
  weight: number;
  ext: "ttf" | "otf" | "woff" | "woff2";
}): Promise<{ url?: string; key?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão inválida." };

  const safeFamily = params.family.trim().replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, "_");
  if (!safeFamily) return { error: "Nome de fonte inválido." };
  const key = `${PREFIX}${safeFamily}-${params.weight}.${params.ext}`;

  const client = createR2Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: "font/" + params.ext,
  });
  const url = await getSignedUrl(client, command, { expiresIn: 300 });

  return { url, key };
}
