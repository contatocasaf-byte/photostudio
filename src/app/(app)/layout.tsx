import Link from "next/link";
import { logout } from "@/app/login/actions";
import { getCurrentAccess, temAlgumaPermissao, temPermissao } from "@/lib/auth/access";

// Server Component (Fase 6) — cada link só aparece se o usuário logado
// tiver PELO MENOS UMA permissão daquele módulo marcada (ou for
// Administrador, que sempre vê tudo). Isso é só a navegação — o
// bloqueio de verdade acontece em cada page.tsx (ver AcessoNegado),
// esconder o link aqui é só não oferecer um caminho pra uma tela que a
// pessoa não pode abrir mesmo.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentAccess();
  const vePermissoesStudio = temAlgumaPermissao(access, ["studio_editor", "studio_marca_dagua", "studio_renomeador", "studio_comparador"]);
  const veOfertas = temAlgumaPermissao(access, ["ofertas_gerar", "ofertas_lote", "ofertas_layout"]);
  const veCatalogos = temPermissao(access, "catalogos_gerenciar");
  const veUsuarios = temPermissao(access, "criar_usuarios");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-6">
            <span className="text-sm font-semibold text-slate-900">Studio Brasmam</span>
            {vePermissoesStudio && (
              <Link href="/studio" className="text-sm text-slate-600 hover:text-slate-900">
                Studio de Produtos
              </Link>
            )}
            {veOfertas && (
              <Link href="/ofertas" className="text-sm text-slate-600 hover:text-slate-900">
                Gerador de Ofertas
              </Link>
            )}
            {veCatalogos && (
              <Link href="/catalogos" className="text-sm text-slate-600 hover:text-slate-900">
                Catálogos
              </Link>
            )}
            {veUsuarios && (
              <Link href="/usuarios" className="text-sm text-slate-600 hover:text-slate-900">
                Usuários
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            {access && <span className="text-xs text-slate-400">{access.email}</span>}
            <form action={logout}>
              <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
