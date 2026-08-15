"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCatalogs, createCatalog, deleteCatalog, type Catalog } from "./actions";
import type { CatalogTipo } from "./core/permissoes";

const LABELS: Record<CatalogTipo, { titulo: string; descricao: string; nomePlaceholder: string; botaoCriar: string; vazio: string }> = {
  catalogo: {
    titulo: "Criador de Catálogos",
    descricao: "Cada catálogo é dividido em seções, com um card-molde próprio por seção.",
    nomePlaceholder: "Nome do novo catálogo",
    botaoCriar: "Criar catálogo",
    vazio: "Nenhum catálogo criado ainda.",
  },
  jornal_ofertas: {
    titulo: "Jornais de Ofertas",
    descricao: "Mesma dinâmica dos catálogos (seções, card-molde, planilha de produtos), com capa opcional e prazo de validade.",
    nomePlaceholder: "Nome do novo jornal de ofertas",
    botaoCriar: "Criar jornal de ofertas",
    vazio: "Nenhum jornal de ofertas criado ainda.",
  },
};

export default function CatalogosPage({
  tipo = "catalogo",
  podeCriarCatalogos,
  podeExcluirCatalogos,
}: {
  tipo?: CatalogTipo;
  podeCriarCatalogos: boolean;
  podeExcluirCatalogos: boolean;
}) {
  const labels = LABELS[tipo];
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await listCatalogs(tipo);
    if (res.error) setError(res.error);
    else setCatalogs(res.catalogs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    listCatalogs(tipo).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setCatalogs(res.catalogs ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tipo]);

  async function handleCreate() {
    if (!novoNome.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await createCatalog(novoNome, tipo);
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
        `Excluir "${catalog.nome}"? Isso também apaga todas as ${catalog.sectionCount} seção(ões) dele. Essa ação não pode ser desfeita.`
      )
    )
      return;
    const res = await deleteCatalog(catalog.id);
    if (res.error) setError(res.error);
    else await refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{labels.titulo}</h1>
        <div className="flex items-center gap-3">
          {tipo === "catalogo" ? (
            <Link href="/catalogos/jornais" className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
              Jornais de Ofertas
            </Link>
          ) : (
            <Link href="/catalogos" className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
              Catálogos
            </Link>
          )}
          <Link href="/catalogos/galeria" className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
            Galeria de Fotos
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">{labels.descricao}</p>

      {podeCriarCatalogos && (
        <div className="mt-4 flex gap-2">
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder={labels.nomePlaceholder}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !novoNome.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? "Criando..." : labels.botaoCriar}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-4 text-sm text-slate-400">Carregando...</p>}

      {!loading && catalogs.length === 0 && <p className="mt-6 text-sm text-slate-400">{labels.vazio}</p>}

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
              {podeExcluirCatalogos && (
                <button
                  onClick={() => handleDelete(c)}
                  className="ml-3 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Excluir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
