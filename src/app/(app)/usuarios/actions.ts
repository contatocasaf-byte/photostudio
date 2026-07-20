"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAccess, type Access, type Papel } from "@/lib/auth/access";
import type { PermissaoChave } from "@/lib/auth/permissoes";

// Tela mais sensível do app (cria contas, concede acesso administrativo)
// — diferente do resto do projeto (server actions só checam login via
// requireUser()), aqui a hierarquia é validada DENTRO de cada action,
// nunca só na tela: Administrador tem acesso total; Supervisor só
// gerencia (cria/edita/exclui) contas de papel "usuario" e nunca pode
// conceder "criar_usuarios" nem mudar o papel de ninguém.
async function requireGestorAcesso(): Promise<{ access: Access } | { error: string }> {
  const access = await getCurrentAccess();
  if (!access) return { error: "Sessão inválida." };
  if (!access.isAdmin && !access.permissoes.has("criar_usuarios")) return { error: "Sem permissão pra gerenciar usuários." };
  return { access };
}

function isContaProtegida(email: string | null | undefined): boolean {
  return !!email && !!process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();
}

export type UsuarioListItem = {
  id: string;
  email: string;
  papel: Papel;
  permissoes: string[];
  criadoEm: string | null;
};

export async function listarUsuarios(): Promise<{ usuarios?: UsuarioListItem[]; error?: string }> {
  const gestor = await requireGestorAcesso();
  if ("error" in gestor) return { error: gestor.error };

  const admin = createAdminClient();

  // Admin API pagina por padrão — laço até esgotar, pra não limitar
  // silenciosamente conforme a equipe cresce.
  const authUsers: { id: string; email: string; criado_em: string }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { error: error.message };
    authUsers.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? "", criado_em: u.created_at })));
    if (data.users.length < 200) break;
    page += 1;
  }

  const [{ data: perfis, error: perfisErr }, { data: permissoesRows, error: permErr }] = await Promise.all([
    admin.from("perfis").select("id, papel"),
    admin.from("permissoes_usuario").select("usuario_id, chave"),
  ]);
  if (perfisErr) return { error: perfisErr.message };
  if (permErr) return { error: permErr.message };

  const papelById = new Map((perfis ?? []).map((p) => [p.id as string, p.papel as Papel]));
  const permissoesByUser = new Map<string, string[]>();
  for (const row of permissoesRows ?? []) {
    const list = permissoesByUser.get(row.usuario_id as string) ?? [];
    list.push(row.chave as string);
    permissoesByUser.set(row.usuario_id as string, list);
  }

  const usuarios: UsuarioListItem[] = authUsers
    .map((u) => ({
      id: u.id,
      email: u.email,
      papel: papelById.get(u.id) ?? "usuario",
      permissoes: permissoesByUser.get(u.id) ?? [],
      criadoEm: u.criado_em,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return { usuarios };
}

export async function getUsuario(usuarioId: string): Promise<{ usuario?: UsuarioListItem; error?: string }> {
  const gestor = await requireGestorAcesso();
  if ("error" in gestor) return { error: gestor.error };

  const admin = createAdminClient();
  const [{ data: authUser, error: authErr }, { data: perfil }, { data: permissoesRows }] = await Promise.all([
    admin.auth.admin.getUserById(usuarioId),
    admin.from("perfis").select("papel, email, criado_em").eq("id", usuarioId).maybeSingle(),
    admin.from("permissoes_usuario").select("chave").eq("usuario_id", usuarioId),
  ]);
  if (authErr || !authUser.user) return { error: authErr?.message ?? "Usuário não encontrado." };

  return {
    usuario: {
      id: usuarioId,
      email: perfil?.email ?? authUser.user.email ?? "",
      papel: (perfil?.papel as Papel | undefined) ?? "usuario",
      permissoes: (permissoesRows ?? []).map((r) => r.chave as string),
      criadoEm: (perfil?.criado_em as string | undefined) ?? authUser.user.created_at,
    },
  };
}

export async function criarUsuario(params: {
  email: string;
  senha: string;
  papel: Papel;
  permissoes: PermissaoChave[];
}): Promise<{ id?: string; error?: string }> {
  const gestor = await requireGestorAcesso();
  if ("error" in gestor) return { error: gestor.error };
  const { access } = gestor;

  const email = params.email.trim().toLowerCase();
  if (!email) return { error: "E-mail é obrigatório." };
  if (!params.senha || params.senha.length < 6) return { error: "Senha precisa de pelo menos 6 caracteres." };

  // Hierarquia: Administrador cria qualquer papel/permissão; Supervisor
  // só cria conta de papel "usuario" e nunca com "criar_usuarios" —
  // reforçado aqui mesmo que o formulário já não deixe escolher isso.
  const papel: Papel = access.isAdmin ? params.papel : "usuario";
  let permissoes = [...new Set(params.permissoes)];
  if (!access.isAdmin) permissoes = permissoes.filter((p) => p !== "criar_usuarios");

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: params.senha,
    email_confirm: true,
  });
  if (createErr || !created.user) return { error: createErr?.message ?? "Falha ao criar usuário." };
  const novoId = created.user.id;

  // O trigger on_auth_user_created já insere um perfil "usuario" —
  // upsert em vez de insert pra não colidir com ele.
  const { error: perfilErr } = await admin
    .from("perfis")
    .upsert({ id: novoId, email, papel, criado_por: access.userId }, { onConflict: "id" });
  if (perfilErr) {
    // Sem transação real entre a Auth API e o Postgres (sistemas
    // diferentes) — desfaz manualmente a conta criada pra não deixar
    // um usuário "fantasma" sem perfil.
    await admin.auth.admin.deleteUser(novoId);
    return { error: perfilErr.message };
  }

  if (permissoes.length > 0) {
    const { error: permInsertErr } = await admin
      .from("permissoes_usuario")
      .insert(permissoes.map((chave) => ({ usuario_id: novoId, chave, concedido_por: access.userId })));
    if (permInsertErr) {
      await admin.auth.admin.deleteUser(novoId);
      return { error: permInsertErr.message };
    }
  }

  revalidatePath("/usuarios");
  return { id: novoId };
}

export async function atualizarPermissoes(usuarioId: string, permissoes: PermissaoChave[]): Promise<{ error?: string }> {
  const gestor = await requireGestorAcesso();
  if ("error" in gestor) return { error: gestor.error };
  const { access } = gestor;

  const admin = createAdminClient();
  const { data: alvo, error: alvoErr } = await admin.from("perfis").select("papel, email").eq("id", usuarioId).maybeSingle();
  if (alvoErr) return { error: alvoErr.message };
  if (!alvo) return { error: "Usuário não encontrado." };
  if (isContaProtegida(alvo.email as string)) return { error: "Não é possível alterar as permissões da conta administradora protegida." };
  if (!access.isAdmin && alvo.papel !== "usuario") return { error: "Supervisor só gerencia contas de nível Usuário." };

  let novasPermissoes = [...new Set(permissoes)];
  if (!access.isAdmin) novasPermissoes = novasPermissoes.filter((p) => p !== "criar_usuarios");

  // Substitui o conjunto inteiro — mais simples que diff, poucas linhas
  // por usuário, sem custo real.
  const { error: delErr } = await admin.from("permissoes_usuario").delete().eq("usuario_id", usuarioId);
  if (delErr) return { error: delErr.message };
  if (novasPermissoes.length > 0) {
    const { error: insErr } = await admin
      .from("permissoes_usuario")
      .insert(novasPermissoes.map((chave) => ({ usuario_id: usuarioId, chave, concedido_por: access.userId })));
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${usuarioId}`);
  return {};
}

// Só Administrador — promover/rebaixar papel é o único poder que
// nenhum Supervisor tem, mesmo com "criar_usuarios" marcada.
export async function atualizarPapel(usuarioId: string, papel: Papel): Promise<{ error?: string }> {
  const access = await getCurrentAccess();
  if (!access?.isAdmin) return { error: "Só administradores podem alterar o papel de um usuário." };
  if (usuarioId === access.userId) return { error: "Você não pode alterar o próprio papel." };

  const admin = createAdminClient();
  const { data: alvo, error: alvoErr } = await admin.from("perfis").select("email").eq("id", usuarioId).maybeSingle();
  if (alvoErr) return { error: alvoErr.message };
  if (isContaProtegida(alvo?.email as string)) return { error: "Não é possível alterar o papel da conta administradora protegida." };

  const { error } = await admin.from("perfis").update({ papel, atualizado_em: new Date().toISOString() }).eq("id", usuarioId);
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${usuarioId}`);
  return {};
}

export async function redefinirSenha(usuarioId: string, novaSenha: string): Promise<{ error?: string }> {
  const gestor = await requireGestorAcesso();
  if ("error" in gestor) return { error: gestor.error };
  const { access } = gestor;
  if (!novaSenha || novaSenha.length < 6) return { error: "Senha precisa de pelo menos 6 caracteres." };

  const admin = createAdminClient();
  const { data: alvo, error: alvoErr } = await admin.from("perfis").select("papel, email").eq("id", usuarioId).maybeSingle();
  if (alvoErr) return { error: alvoErr.message };
  if (isContaProtegida(alvo?.email as string)) return { error: "Não é possível redefinir a senha da conta administradora protegida." };
  if (!access.isAdmin && alvo?.papel !== "usuario") return { error: "Supervisor só gerencia contas de nível Usuário." };

  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: novaSenha });
  if (error) return { error: error.message };
  return {};
}

export async function excluirUsuario(usuarioId: string): Promise<{ error?: string }> {
  const gestor = await requireGestorAcesso();
  if ("error" in gestor) return { error: gestor.error };
  const { access } = gestor;
  if (usuarioId === access.userId) return { error: "Você não pode excluir a própria conta." };

  const admin = createAdminClient();
  const { data: alvo, error: alvoErr } = await admin.from("perfis").select("papel, email").eq("id", usuarioId).maybeSingle();
  if (alvoErr) return { error: alvoErr.message };
  if (isContaProtegida(alvo?.email as string)) return { error: "Não é possível excluir a conta administradora protegida." };
  if (!access.isAdmin && alvo?.papel !== "usuario") return { error: "Supervisor só gerencia contas de nível Usuário." };

  const { error } = await admin.auth.admin.deleteUser(usuarioId);
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  return {};
}
