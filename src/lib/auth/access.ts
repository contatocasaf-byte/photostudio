import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { permissoesDoModulo, type PermissaoChave } from "./permissoes";

export type Papel = "usuario" | "supervisor" | "administrador";

export type Access = {
  userId: string;
  email: string;
  papel: Papel;
  isAdmin: boolean;
  permissoes: Set<string>;
};

// Lido tanto pelo layout (esconder link de módulo) quanto por cada
// page.tsx (bloquear a tela) — cache() do React dedupe as 3 queries
// (auth.getUser + perfis + permissoes_usuario) entre as várias
// chamadas que acontecem na MESMA requisição/navegação, em vez de
// bater no banco de novo a cada componente que precisa saber o acesso.
export const getCurrentAccess = cache(async (): Promise<Access | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: perfil }, { data: permissoesRows }] = await Promise.all([
    supabase.from("perfis").select("papel, email").eq("id", user.id).maybeSingle(),
    supabase.from("permissoes_usuario").select("chave").eq("usuario_id", user.id),
  ]);

  // Sem linha em `perfis` ainda (não deveria acontecer — o trigger
  // `on_auth_user_created` cria automaticamente — mas se acontecer,
  // trata como "usuario" sem nenhuma permissão, nunca como admin).
  const papel = (perfil?.papel as Papel | undefined) ?? "usuario";

  return {
    userId: user.id,
    email: perfil?.email ?? user.email ?? "",
    papel,
    isAdmin: papel === "administrador",
    permissoes: new Set((permissoesRows ?? []).map((r) => r.chave as string)),
  };
});

export function temPermissao(access: Access | null, chave: PermissaoChave): boolean {
  if (!access) return false;
  return access.isAdmin || access.permissoes.has(chave);
}

export function temAlgumaPermissao(access: Access | null, chaves: PermissaoChave[]): boolean {
  if (!access) return false;
  return access.isAdmin || chaves.some((c) => access.permissoes.has(c));
}

// Primeira rota que o usuário logado consegue realmente abrir — usada
// tanto no redirect pós-login/rota raiz quanto no link de volta da
// tela de "Acesso negado". Ordem fixa (Studio -> Ofertas -> Catálogos
// -> Usuários); null = nenhum módulo liberado (perfil sem permissão
// nenhuma ainda).
export function primeiraRotaAcessivel(access: Access | null): string | null {
  if (!access) return null;
  if (temAlgumaPermissao(access, ["studio_editor", "studio_marca_dagua", "studio_renomeador", "studio_comparador"])) return "/studio";
  if (temAlgumaPermissao(access, ["ofertas_gerar", "ofertas_lote", "ofertas_layout"])) return "/ofertas";
  // "Gerenciar catálogos" foi dividida em 6 permissões — QUALQUER
  // permissão do módulo Catálogos já libera entrada (mesmo padrão de
  // Studio/Ofertas acima), calculado dinamicamente pra nunca precisar
  // atualizar essa lista à mão quando uma permissão nova for criada.
  if (temAlgumaPermissao(access, permissoesDoModulo("catalogos").map((p) => p.chave))) return "/catalogos";
  if (temPermissao(access, "criar_usuarios")) return "/usuarios";
  return null;
}
