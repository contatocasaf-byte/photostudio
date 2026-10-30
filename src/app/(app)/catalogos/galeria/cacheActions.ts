"use server";

import { createClient } from "@/lib/supabase/server";
import { chaveDaFoto, chavesEmCache, galeriaCacheAtivo, garantirFotoNoCache, type FotoRef } from "@/lib/galeriaCache";
import { mapComLimite } from "@/lib/galeriaCacheCore";
import { listGaleriaImages } from "./actions";

// Ações do cache de fotos no R2 (ver src/lib/galeriaCacheCore.ts). Todas
// exigem login. Só ligam quando R2_GALERIA_BUCKET_NAME está configurada.

const COPIAS_EM_PARALELO = 5;
const MAX_LOTE = 12;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export type CacheStatus = { ativo: boolean; total?: number; emCache?: number; semVersao?: number; error?: string };

// Quantas fotos da galeria já estão no cache.
export async function getGaleriaCacheStatus(): Promise<CacheStatus> {
  if (!(await requireUser())) return { ativo: false, error: "Sessão inválida." };
  if (!galeriaCacheAtivo()) return { ativo: false };

  const galeria = await listGaleriaImages();
  if (galeria.error) return { ativo: true, error: galeria.error };
  try {
    const noCache = await chavesEmCache();
    const files = galeria.files ?? [];
    const comVersao = files.filter((f) => f.version);
    return {
      ativo: true,
      total: comVersao.length,
      emCache: comVersao.filter((f) => noCache.has(chaveDaFoto(f.id, f.version as string, f.name))).length,
      semVersao: files.length - comVersao.length,
    };
  } catch (e) {
    return { ativo: true, error: `Não foi possível ler o bucket de fotos: ${e instanceof Error ? e.message : "erro desconhecido"}` };
  }
}

// Fotos da galeria que ainda NÃO foram copiadas.
export async function listarPendentesCache(): Promise<{ pendentes?: FotoRef[]; error?: string }> {
  if (!(await requireUser())) return { error: "Sessão inválida." };
  if (!galeriaCacheAtivo()) return { error: "O cache de fotos não está configurado." };

  const galeria = await listGaleriaImages();
  if (galeria.error) return { error: galeria.error };
  try {
    const noCache = await chavesEmCache();
    const pendentes: FotoRef[] = [];
    for (const f of galeria.files ?? []) {
      if (!f.version) continue;
      const key = chaveDaFoto(f.id, f.version, f.name);
      if (!noCache.has(key)) pendentes.push({ fileId: f.id, version: f.version, key });
    }
    return { pendentes };
  } catch (e) {
    return { error: `Não foi possível ler o bucket de fotos: ${e instanceof Error ? e.message : "erro desconhecido"}` };
  }
}

// Dentre `refs`, as que ainda faltam copiar (usado pela exportação de PDF).
export async function filtrarPendentesCache(refs: FotoRef[]): Promise<{ pendentes?: FotoRef[]; error?: string }> {
  if (!(await requireUser())) return { error: "Sessão inválida." };
  if (!galeriaCacheAtivo()) return { error: "O cache de fotos não está configurado." };
  try {
    const noCache = await chavesEmCache();
    return { pendentes: refs.filter((r) => !noCache.has(r.key)) };
  } catch (e) {
    return { error: `Não foi possível ler o bucket de fotos: ${e instanceof Error ? e.message : "erro desconhecido"}` };
  }
}

// Copia um lote de fotos do Drive pro bucket privado. Só aceita arquivos que
// estão na galeria configurada e chaves coerentes com o arquivo+versão — o
// cliente não escolhe o que gravar nem onde.
export async function garantirFotosNoCache(refs: FotoRef[]): Promise<{ resultados?: { key: string; ok: boolean }[]; error?: string }> {
  if (!(await requireUser())) return { error: "Sessão inválida." };
  if (!galeriaCacheAtivo()) return { error: "O cache de fotos não está configurado." };
  if (!Array.isArray(refs) || refs.length === 0) return { resultados: [] };
  if (refs.length > MAX_LOTE) return { error: `Lote grande demais (máximo ${MAX_LOTE} fotos).` };

  const galeria = await listGaleriaImages();
  if (galeria.error) return { error: galeria.error };
  const naGaleria = new Map((galeria.files ?? []).map((f) => [f.id, f]));

  const resultados = await mapComLimite(refs, COPIAS_EM_PARALELO, async (ref) => {
    try {
      const arquivo = naGaleria.get(ref.fileId);
      if (!arquivo || arquivo.version !== ref.version) return { key: ref.key, ok: false };
      if (chaveDaFoto(ref.fileId, ref.version, arquivo.name) !== ref.key) return { key: ref.key, ok: false };
      await garantirFotoNoCache(ref);
      return { key: ref.key, ok: true };
    } catch {
      return { key: ref.key, ok: false };
    }
  });
  return { resultados };
}

// O PDF só pode usar as fotos do cache se o servidor de PDF (Render) também
// estiver configurado pra ler o bucket — senão as fotos sumiriam do PDF.
export async function galeriaCachePronto(): Promise<boolean> {
  if (!(await requireUser())) return false;
  if (!galeriaCacheAtivo()) return false;
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { galeria?: boolean };
    return data.galeria === true;
  } catch {
    return false;
  }
}
