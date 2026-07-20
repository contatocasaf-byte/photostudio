import "server-only";
import { createClient } from "@supabase/supabase-js";

// Client de service role — ignora RLS e faz operações administrativas
// (`auth.admin.*`: criar/listar/editar/excluir usuário) que a chave
// anon (`server.ts`/`client.ts`) não tem permissão de fazer. `import
// "server-only"` quebra o BUILD (não só em runtime) se este arquivo
// for importado por engano de um componente `"use client"` — a chave
// nunca pode chegar no browser.
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
