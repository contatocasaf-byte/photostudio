"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAccess, primeiraRotaAcessivel } from "@/lib/auth/access";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Não foi possível entrar.")}`);
  }

  // Fase 6: destino pós-login depende do que essa conta pode acessar
  // (antes era sempre "/studio" fixo) — sem isso, um usuário sem
  // permissão no Studio caía direto numa tela bloqueada ao logar.
  const access = await getCurrentAccess();
  redirect(primeiraRotaAcessivel(access) ?? "/sem-acesso");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
