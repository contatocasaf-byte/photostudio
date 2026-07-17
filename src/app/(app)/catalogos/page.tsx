"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCatalogs, createCatalog, deleteCatalog, type Catalog } from "./actions";

export default function CatalogosPage() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await listCatalogs();
    if (res.error) setError(res.error);
    else setCatalogs(res.catalogs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    listCatalogs().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setCatalogs(res.catalogs ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (!novoNome.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await createCatalog(novoNome);
      if (res.error) {
        setError(res.error);
        return;
      }
      setNovoNome("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(catalog: Catalog) {
    if (
      !confirm(
        `Excluir o catálogo "${catalog.nome}"? Isso também apaga todas as ${catalog.sectionCount} seção(ões) dele. Essa ação não pode ser desfeita.`
      )
    )
      return;
    const res = await deleteCatalog(catalog.id);
    if (res.error) setError(res.error);
    else await refresh();
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Criador de Catálogos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Cada catálogo é dividido em seções, com um card-molde próprio por seção.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Nome do novo catálogo"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !novoNome.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {creating ? "Criando..." : "Criar catálogo"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-400">Carregando catálogos...</p>}

      {!loading && catalogs.length === 0 && (
        <p className="mt-6 text-sm text-slate-400">Nenhum catálogo criado ainda.</p>
      )}

      {!loading && catalogs.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {catalogs.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3"
            >
              <Link href={`/catalogos/${c.id}`} className="flex-1">
                <p className="text-sm font-medium text-slate-900 hover:underline">{c.nome}</p>
                <p className="text-xs text-slate-400">
                  {c.sectionCount} {c.sectionCount === 1 ? "seção" : "seções"} · criado em{" "}
                  {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                </p>
              </Link>
              <button
                onClick={() => handleDelete(c)}
                className="ml-3 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
