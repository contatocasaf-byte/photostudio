"use client";

import { useState } from "react";
import { MODULO_LABEL, permissoesDoModulo, type PermissaoChave } from "@/lib/auth/permissoes";
import type { Papel } from "@/lib/auth/access";
import { criarUsuario } from "./actions";

const PAPEL_LABEL: Record<Papel, string> = { usuario: "Usuário", supervisor: "Supervisor", administrador: "Administrador" };

export default function NovoUsuarioForm({
  isAdmin,
  onCreated,
  onCancel,
}: {
  isAdmin: boolean;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>("usuario");
  const [selecionadas, setSelecionadas] = useState<Set<PermissaoChave>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(chave: PermissaoChave) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  async function handleSubmit() {
    if (!email.trim() || senha.length < 6) return;
    setSaving(true);
    setError(null);
    try {
      const res = await criarUsuario({ email, senha, papel, permissoes: [...selecionadas] });
      if (res.error) {
        setError(res.error);
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-slate-300 p-4">
      <p className="text-sm font-medium text-slate-900">Novo usuário</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Senha (repasse manualmente pro usuário depois)</label>
          <input
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {isAdmin && (
        <div className="mt-3">
          <label className="text-xs text-slate-500">Papel</label>
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value as Papel)}
            className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {(Object.keys(PAPEL_LABEL) as Papel[]).map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      )}
      {!isAdmin && <p className="mt-3 text-xs text-slate-400">Supervisores só criam contas de nível Usuário.</p>}

      <div className="mt-4 grid grid-cols-3 gap-4">
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
        <label className="mt-4 flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <input type="checkbox" checked={selecionadas.has("criar_usuarios")} onChange={() => toggle("criar_usuarios")} />
          Criar usuários (só marcável se o papel escolhido for Supervisor)
        </label>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !email.trim() || senha.length < 6}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Criando..." : "Criar usuário"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}
