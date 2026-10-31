import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cache das fotos da galeria (Google Drive) num bucket PRIVADO do R2 —
// núcleo sem nada específico de servidor (recebe o cliente S3 e a função
// de baixar do Drive), pra poder ser testado isoladamente. A fiação com as
// credenciais reais fica em galeriaCache.ts.
//
// Por que existe: antes, cada foto passava Drive -> função da Vercel ->
// navegador (e o PDF baixava e subia todas as fotos de novo), o que estourou
// a cota de Fast Origin Transfer do plano gratuito e deixava tudo lento.
// Agora a foto é copiada UMA vez pro R2 e o navegador (e o servidor de PDF)
// lê direto de lá. O bucket é privado: só quem está logado recebe um link
// temporário assinado.
//
// Chave: galeria/<fileId>/<versão>.<ext> — a "versão" é o md5 do arquivo no
// Drive. Substituir a foto mantendo o mesmo nome (o processo de hoje) muda o
// md5 (ou o fileId), então a chave muda e a cópia nova é feita sozinha; a
// cópia antiga fica parada, sem ser usada.

export const GALERIA_PREFIX = "galeria/";
const CACHE_CONTROL = "private, max-age=31536000, immutable";

// Link temporário: assinado "no começo da janela" de 6h e válido por 12h, em
// vez de assinado a cada pedido. Assim o endereço é o MESMO durante a
// janela e o navegador reaproveita a foto em cache entre uma visita e outra
// (link novo a cada pedido = cache nunca acerta).
const JANELA_MS = 6 * 60 * 60 * 1000;
const VALIDADE_S = 12 * 60 * 60;

export type FotoRef = { fileId: string; version: string; key: string };

export type BaixarDoDrive = (fileId: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
// Gera a versão reduzida (leve) da foto, usada só na tela de visualização.
export type GerarMiniatura = (bytes: Uint8Array) => Promise<Uint8Array>;
export type CacheDeps = { s3: S3Client; bucket: string; baixar: BaixarDoDrive; miniatura?: GerarMiniatura };

// Cada foto tem 2 cópias no cache: a ORIGINAL (usada no PDF, qualidade total)
// e uma MINIATURA em WebP (usada na visualização do catálogo — o navegador
// baixava ~1 MB por foto; a miniatura tem ~100 KB). Mesma pasta, sufixo fixo.
export function chaveMiniatura(key: string): string {
  return key.replace(/\.[^./]+$/, "") + ".preview.webp";
}

const EXT_POR_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function extensaoParaChave(nome: string, mime?: string): string {
  const m = /\.([A-Za-z0-9]{2,5})\s*$/.exec(nome.trim());
  if (m) return m[1].toLowerCase();
  return (mime && EXT_POR_MIME[mime]) || "jpg";
}

export function chaveDaFoto(fileId: string, version: string, nome: string, mime?: string): string {
  // ids do Drive são [A-Za-z0-9_-]; a versão já vem saneada — recusa
  // qualquer outra coisa pra nunca montar uma chave com "../" ou similar.
  if (!/^[A-Za-z0-9_-]+$/.test(fileId) || !/^[A-Za-z0-9_-]+$/.test(version)) throw new Error("fileId/versão inválidos para o cache de fotos.");
  return `${GALERIA_PREFIX}${fileId}/${version}.${extensaoParaChave(nome, mime)}`;
}

// Todas as chaves já copiadas (1 a 2 consultas de lista, não 1 por foto).
export async function listarChavesNoCache(s3: S3Client, bucket: string): Promise<Set<string>> {
  const chaves = new Set<string>();
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: GALERIA_PREFIX, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) chaves.add(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return chaves;
}

export async function existe(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const nome = (e as { name?: string }).name;
    if (status === 404 || nome === "NotFound" || nome === "NoSuchKey") return false;
    throw e;
  }
}

// Garante que a foto (original + miniatura) está no cache: copia do Drive o que
// faltar. Se só a miniatura falta, lê a original do próprio R2 (não gasta o
// Drive). Falha ao gerar a miniatura NÃO derruba a cópia: o PDF só usa a
// original, e a tela de visualização cai pra original se não houver miniatura.
export async function copiarParaCache(deps: CacheDeps, ref: { fileId: string; key: string }): Promise<"copiada" | "ja_existia"> {
  const keyMini = deps.miniatura ? chaveMiniatura(ref.key) : null;
  const [temOriginal, temMini] = await Promise.all([
    existe(deps.s3, deps.bucket, ref.key),
    keyMini ? existe(deps.s3, deps.bucket, keyMini) : Promise.resolve(true),
  ]);
  if (temOriginal && temMini) return "ja_existia";

  let bytes: Uint8Array;
  if (temOriginal) {
    const obj = await deps.s3.send(new GetObjectCommand({ Bucket: deps.bucket, Key: ref.key }));
    bytes = await obj.Body!.transformToByteArray();
  } else {
    const baixada = await deps.baixar(ref.fileId);
    bytes = baixada.bytes;
    await deps.s3.send(
      new PutObjectCommand({
        Bucket: deps.bucket,
        Key: ref.key,
        Body: bytes,
        ContentType: baixada.contentType || "image/jpeg",
        CacheControl: CACHE_CONTROL,
      })
    );
  }

  if (deps.miniatura && keyMini && !temMini) {
    try {
      const mini = await deps.miniatura(bytes);
      await deps.s3.send(
        new PutObjectCommand({ Bucket: deps.bucket, Key: keyMini, Body: mini, ContentType: "image/webp", CacheControl: CACHE_CONTROL })
      );
    } catch {
      // segue só com a original
    }
  }
  return temOriginal ? "ja_existia" : "copiada";
}

export async function urlAssinada(s3: S3Client, bucket: string, key: string, agora: Date = new Date()): Promise<string> {
  const inicioDaJanela = new Date(Math.floor(agora.getTime() / JANELA_MS) * JANELA_MS);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: VALIDADE_S, signingDate: inicioDaJanela });
}

// Roda `fn` sobre os itens com no máximo `limite` ao mesmo tempo.
export async function mapComLimite<T, R>(itens: T[], limite: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}
