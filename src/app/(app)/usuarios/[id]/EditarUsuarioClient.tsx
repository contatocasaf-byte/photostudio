"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODULO_LABEL, permissoesDoModulo, type PermissaoChave } from "@/lib/auth/permissoes";
import type { Papel } from "@/lib/auth/access";
import { atualizarPapel, atualizarPermissoes, excluirUsuario, getUsuario, redefinirSenha, type UsuarioListItem } from "../actions";

const PAPEL_LABEL: Record<Papel, string> = { usuario: "Usuário", supervisor: "Supervisor", administrador: "Administrador" };

export default function EditarUsuarioClient({
  usuarioId,
  isAdmin,
  currentUserId,
}: {
  usuarioId: string;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [usuario, setUsuario] = useState<UsuarioListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [papel, setPapel] = useState<Papel>("usuario");
  const [selecionadas, setSelecionadas] = useState<Set<PermissaoChave>>(new Set());
  const [novaSenha, setNovaSenha] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUsuario(usuarioId).then((res) => {
      if (cancelled) return;
      if (res.error || !res.usuario) {
        setError(res.error ?? "Usuário não encontrado.");
        setLoading(false);
        return;
      }
      setUsuario(res.usuario);
      setPapel(res.usuario.papel);
      setSelecionadas(new Set(res.usuario.permissoes as PermissaoChave[]));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [usuarioId]);

  function toggle(chave: PermissaoChave) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  // Supervisor só gerencia conta de nível Usuário — mesma regra
  // reforçada no servidor; aqui é só pra desabilitar a UI cedo.
  const podeGerenciar = isAdmin || usuario?.papel === "usuario";

  async function handleSalvarPermissoes() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await atualizarPermissoes(usuarioId, [...selecionadas]);
      setStatus(res.error ? `⚠ ${res.error}` : "✔ Permissões salvas.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSalvarPapel() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await atualizarPapel(usuarioId, papel);
      setStatus(res.error ? `⚠ ${res.error}` : "✔ Papel atualizado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRedefinirSenha() {
    if (novaSenha.length < 6) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await redefinirSenha(usuarioId, novaSenha);
      setStatus(res.error ? `⚠ ${res.error}` : "✔ Senha redefinida — repasse a nova senha pro usuário.");
      if (!res.error) setNovaSenha("");
    } finally {
      setSaving(false);
    }
  }

  async function handleExcluir() {
    if (!usuario) return;
    if (!confirm(`Excluir a conta "${usuario.email}"? Essa ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      const res = await excluirUsuario(usuarioId);
      if (res.error) {
        setStatus(`⚠ ${res.error}`);
        return;
      }
      router.push("/usuarios");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando usuário...</p>;

  return (
    <div>
      <Link href="/usuarios" className="text-xs text-slate-500 hover:text-slate-700">
        ← Usuários
      </Link>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {usuario && (
        <>
          <h1 className="mt-2 text-lg font-semibold text-slate-900">{usuario.email}</h1>

          {usuarioId === currentUserId && <p className="mt-1 text-xs text-slate-400">Esta é a sua própria conta.</p>}
          {!podeGerenciar && (
            <p className="mt-1 text-xs text-red-600">Você não tem permissão pra gerenciar uma conta de nível {PAPEL_LABEL[usuario.papel]}.</p>
          )}

          {status && <p className="mt-2 text-xs text-slate-500">{status}</p>}

          {isAdmin && usuarioId !== currentUserId && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <label className="text-xs text-slate-500">Papel</label>
              <select
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                {(Object.keys(PAPEL_LABEL) as Papel[]).map((p) => (
                  <option key={p} value={p}>
                    {PAPEL_LABEL[p]}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSalvarPapel}
                disabled={saving || papel === usuario.papel}
                className="rounded-md bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
              >
                Salvar papel
              </button>
            </div>
          )}

          {podeGerenciar && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-4 rounded-md border border-slate-200 p-3">
                {(["studio", "ofertas", "catalogos"] as const).map((modulo) => (
                  <div key={modulo}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{MODULO_LABEL[modulo]}</p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {permissoesDoModulo(modulo).map((p) => (
                        <label key={p.chave} className="flex items-start gap-1.5 text-xs text-slate-700">
                          <input type="checkbox" checked={selecionadas.has(p.chave)} onChange={() => toggle(p.chave)} className="mt-0.5" />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {isAdmin && (
                <label className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <input type="checkbox" checked={selecionadas.has("criar_usuarios")} onChange={() => toggle("criar_usuarios")} />
                  Criar usuários
                </label>
              )}

              <button
                onClick={handleSalvarPermissoes}
                disabled={saving}
                className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Salvar permissões
              </button>

              <div className="mt-6 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <label className="text-xs text-slate-500">Redefinir senha</label>
                <input
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={handleRedefinirSenha}
                  disabled={saving || novaSenha.length < 6}
                  className="rounded-md bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                >
                  Redefinir
                </button>
              </div>

              {usuarioId !== currentUserId && (
                <button
                  onClick={handleExcluir}
                  disabled={saving}
                  className="mt-6 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Excluir conta
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
