"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listarUsuarios, type UsuarioListItem } from "./actions";
import NovoUsuarioForm from "./NovoUsuarioForm";
import type { Papel } from "@/lib/auth/access";

const PAPEL_LABEL: Record<Papel, string> = { usuario: "Usuário", supervisor: "Supervisor", administrador: "Administrador" };
const PAPEL_COR: Record<Papel, string> = {
  usuario: "bg-slate-100 text-slate-700",
  supervisor: "bg-blue-100 text-blue-700",
  administrador: "bg-amber-100 text-amber-800",
};

export default function UsuariosListClient({ isAdmin, currentUserId }: { isAdmin: boolean; currentUserId: string }) {
  const [usuarios, setUsuarios] = useState<UsuarioListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

// `load` só é chamada de dentro de handlers de evento (recarregar
  // depois de criar um usuário) — nunca síncrona dentro de um efeito,
  // pra não disparar o lint react-hooks/set-state-in-effect.
  async function load() {
    setLoading(true);
    const res = await listarUsuarios();
    if (res.error) setError(res.error);
    else setUsuarios(res.usuarios ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    listarUsuarios().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setUsuarios(res.usuarios ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Usuários</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin ? "Administrador — gerencia qualquer conta." : "Supervisor — cria/gerencia contas de nível Usuário."}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Novo usuário
          </button>
        )}
      </div>

      {showForm && (
        <NovoUsuarioForm
          isAdmin={isAdmin}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {usuarios.map((u) => {
            // Sem gestão possível pra Supervisor sobre Supervisor/Administrador
            // — servidor já bloqueia de novo, isso é só a UI refletindo.
            const podeGerenciar = isAdmin || u.papel === "usuario";
            return (
              <div key={u.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{u.email}</span>
                <span className={"shrink-0 rounded-md px-2 py-0.5 text-xs font-medium " + PAPEL_COR[u.papel]}>{PAPEL_LABEL[u.papel]}</span>
                <span className="shrink-0 text-xs text-slate-400">{u.permissoes.length} permissões</span>
                {u.id === currentUserId ? (
                  <span className="shrink-0 text-xs text-slate-400">(você)</span>
                ) : podeGerenciar ? (
                  <Link
                    href={`/usuarios/${u.id}`}
                    className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Editar
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-slate-300">Sem acesso pra gerenciar</span>
                )}
              </div>
            );
          })}
          {usuarios.length === 0 && <p className="text-sm text-slate-400">Nenhum usuário ainda.</p>}
        </div>
      )}
    </div>
  );
}
