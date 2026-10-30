import "server-only";
import { createR2Client } from "@/lib/storage/r2";
import { createDriveClient } from "@/lib/googleDrive";
import { chaveDaFoto, copiarParaCache, listarChavesNoCache, urlAssinada, type CacheDeps, type FotoRef } from "./galeriaCacheCore";

export { chaveDaFoto, type FotoRef };

// Fiação do cache de fotos (ver galeriaCacheCore.ts) com as credenciais
// reais. Só liga quando R2_GALERIA_BUCKET_NAME está configurada — sem ela o
// sistema continua servindo as fotos pelo proxy de antes (nada quebra).

export function galeriaBucket(): string | null {
  return process.env.R2_GALERIA_BUCKET_NAME || null;
}

export function galeriaCacheAtivo(): boolean {
  return galeriaBucket() !== null;
}

function deps(): CacheDeps {
  const bucket = galeriaBucket();
  if (!bucket) throw new Error("R2_GALERIA_BUCKET_NAME não configurada.");
  return {
    s3: createR2Client(),
    bucket,
    baixar: async (fileId) => {
      const drive = createDriveClient();
      const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
      return {
        bytes: new Uint8Array(res.data as unknown as ArrayBuffer),
        contentType: (res.headers?.["content-type"] as string | undefined) ?? "image/jpeg",
      };
    },
  };
}

export async function chavesEmCache(): Promise<Set<string>> {
  const d = deps();
  return listarChavesNoCache(d.s3, d.bucket);
}

export async function garantirFotoNoCache(ref: FotoRef): Promise<"copiada" | "ja_existia"> {
  return copiarParaCache(deps(), ref);
}

export async function linkTemporarioDaFoto(key: string): Promise<string> {
  const d = deps();
  return urlAssinada(d.s3, d.bucket, key);
}

// Nome/versão de um arquivo quando a URL não trouxe (?v=) — 1 consulta leve
// ao Drive.
export async function metadadosDoArquivo(fileId: string): Promise<{ name: string; version: string; mimeType: string } | null> {
  const drive = createDriveClient();
  const res = await drive.files.get({ fileId, fields: "name, mimeType, md5Checksum, modifiedTime", supportsAllDrives: true });
  const bruta = res.data.md5Checksum || (res.data.modifiedTime ? res.data.modifiedTime.replace(/\D/g, "") : "");
  if (!res.data.name || !bruta) return null;
  return { name: res.data.name, version: bruta.replace(/[^A-Za-z0-9_-]/g, "_"), mimeType: res.data.mimeType ?? "image/jpeg" };
}
