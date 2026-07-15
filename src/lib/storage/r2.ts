import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

// R2 é compatível com a API do S3 — usa o SDK padrão da AWS, só apontando o
// endpoint pro R2. Nunca importar deste módulo em código que roda no
// navegador (o "server-only" acima quebra o build se isso acontecer) — a
// Secret Key nunca pode chegar no cliente.
export function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
