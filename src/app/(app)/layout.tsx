import Link from "next/link";
import { logout } from "@/app/login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-6">
            <span className="text-sm font-semibold text-slate-900">Studio Brasmam</span>
            <Link href="/studio" className="text-sm text-slate-600 hover:text-slate-900">
              Studio de Produtos
            </Link>
            <Link href="/ofertas" className="text-sm text-slate-600 hover:text-slate-900">
              Gerador de Ofertas
            </Link>
          </nav>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
