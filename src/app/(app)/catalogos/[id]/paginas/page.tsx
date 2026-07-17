"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getCatalog } from "../../actions";
import { getPageTemplate } from "../../paginas/actions";
import { PAGE_TIPOS, type PageTipo } from "../../core/pageConfig";

export default function PaginasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: catalogId } = use(params);
  const [catalogNome, setCatalogNome] = useState<string | null>(null);
  const [status, setStatus] = useState<Partial<Record<PageTipo, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCatalog(catalogId), ...PAGE_TIPOS.map((t) => getPageTemplate(catalogId, t.value))]).then(
      ([catalogRes, ...templateResults]) => {
        if (cancelled) return;
        if (catalogRes.error) setError(catalogRes.error);
        else setCatalogNome(catalogRes.catalog?.nome ?? "");

        const next: Partial<Record<PageTipo, boolean>> = {};
        PAGE_TIPOS.forEach((t, i) => {
          const res = templateResults[i];
          if (res.error) setError(res.error);
          next[t.value] = !!res.template;
        });
        setStatus(next);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [catalogId]);

  if (loading) return <p className="text-sm text-slate-400">Carregando modelos de página...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {catalogNome}
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Modelos de Página</h1>
      <p className="mt-1 text-sm text-slate-500">
        Cabeçalho e rodapé de cada tipo de página deste catálogo. O tamanho da página é compartilhado entre os 3
        modelos.
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {PAGE_TIPOS.map((t) => (
          <Link
            key={t.value}
            href={`/catalogos/${catalogId}/paginas/${t.value}`}
            className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
          >
            <span className="text-sm font-medium text-slate-900">{t.label}</span>
            <span className={"text-xs " + (status[t.value] ? "text-emerald-700" : "text-slate-400")}>
              {status[t.value] ? "Configurado" : "Não configurado"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
