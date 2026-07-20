import Link from "next/link";
import { getCurrentAccess, primeiraRotaAcessivel } from "@/lib/auth/access";

// Server Component compartilhado — cada page.tsx protegido renderiza
// isso em vez do conteúdo real quando o usuário não tem a permissão
// necessária. `getCurrentAccess()` é cache()ado (ver access.ts), então
// chamar de novo aqui não bate no banco outra vez na mesma requisição.
export default async function AcessoNegado() {
  const access = await getCurrentAccess();
  const rota = primeiraRotaAcessivel(access);

  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-semibold text-slate-900">Acesso negado</h1>
      <p className="mt-2 text-sm text-slate-500">Você não tem permissão pra acessar esta área.</p>
      {rota ? (
        <Link href={rota} className="mt-4 inline-block text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900">
          Voltar pra uma área que você acessa
        </Link>
      ) : (
        <p className="mt-4 text-xs text-slate-400">Nenhum módulo liberado pra sua conta ainda — peça a um administrador ou supervisor.</p>
      )}
    </div>
  );
}
