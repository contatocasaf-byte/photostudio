// Usuário já VALIDADO pelo proxy (src/proxy.ts), repassado à renderização
// da página/Server Action por um cabeçalho interno — evita que
// getCurrentAccess() chame supabase.auth.getUser() de novo (cada chamada
// é uma ida e volta ao servidor de autenticação do Supabase, e o proxy e
// a renderização rodam em fases separadas, sem compartilhar o resultado).
//
// Segurança: o proxy SEMPRE apaga esse cabeçalho vindo do cliente antes
// de (re)escrevê-lo, e o valor é assinado (HMAC-SHA256) com um segredo só
// do servidor — mesmo que o proxy fosse contornado por algum bug, um
// cabeçalho forjado não passa na verificação. Sem segredo configurado,
// ou com assinatura inválida/expirada, getCurrentAccess() simplesmente
// volta ao caminho antigo (getUser), nunca confia.
//
// Só Web Crypto (globalThis.crypto) — roda igual no proxy e no servidor.

export const VERIFIED_USER_HEADER = "x-photostudio-verified-user";

export type VerifiedUser = { id: string; email: string };

// Vale só durante a MESMA requisição — janela curta só pra tolerar
// diferença de relógio entre fases.
const MAX_AGE_MS = 2 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 10 * 1000;

function getSecret(): string | null {
  // Ambos são segredos só de servidor (nunca NEXT_PUBLIC_). O service
  // role já é obrigatório em produção (sistema de usuários); o segredo do
  // backend é o fallback pra ambiente local, onde o service role pode
  // estar em branco.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.BACKEND_SHARED_SECRET;
  return secret ? secret : null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  // Prefixo de contexto: a chave de assinatura deste cabeçalho nunca é o
  // segredo cru, então não se confunde com outro uso do mesmo segredo.
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`photostudio-verified-user:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signVerifiedUser(user: VerifiedUser): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;

  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ id: user.id, email: user.email, t: Date.now() })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function readVerifiedUser(headerValue: string | null | undefined): Promise<VerifiedUser | null> {
  if (!headerValue) return null;
  const secret = getSecret();
  if (!secret) return null;

  const parts = headerValue.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;

  // crypto.subtle.verify compara em tempo constante.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signatureBytes as BufferSource, new TextEncoder().encode(payload));
  if (!ok) return null;

  const payloadBytes = fromBase64Url(payload);
  if (!payloadBytes) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(payloadBytes)) as { id?: unknown; email?: unknown; t?: unknown };
    if (typeof data.id !== "string" || !data.id || typeof data.email !== "string" || typeof data.t !== "number") return null;
    const age = Date.now() - data.t;
    if (age > MAX_AGE_MS || age < -MAX_FUTURE_SKEW_MS) return null;
    return { id: data.id, email: data.email };
  } catch {
    return null;
  }
}
