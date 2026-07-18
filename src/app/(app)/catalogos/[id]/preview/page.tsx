"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getCatalogPreviewData } from "../../preview/actions";
import { reflowCatalog, type PreviewPage, type SkippedSection } from "../../core/reflow";
import PreviewPageCanvas from "./PreviewPageCanvas";

const MOTIVO_LABEL: Record<SkippedSection["motivo"], string> = {
  sem_card_molde: "sem card-molde configurado",
  sem_produtos: "sem produtos adicionados",
};

export default function CatalogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: catalogId } = use(params);

  const [catalogNome, setCatalogNome] = useState<string | null>(null);
  const [paginaLargura, setPaginaLargura] = useState(0);
  const [paginaAltura, setPaginaAltura] = useState(0);
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [skipped, setSkipped] = useState<SkippedSection[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCatalogPreviewData(catalogId).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error ?? "Falha ao carregar catálogo.");
        setLoading(false);
        return;
      }
      const { data } = res;
      setCatalogNome(data.catalogNome);
      setPaginaLargura(data.paginaLargura);
      setPaginaAltura(data.paginaAltura);
      const { pages: computed, skipped: skippedSections } = reflowCatalog({
        paginaLargura: data.paginaLargura,
        paginaAltura: data.paginaAltura,
        pageTemplates: data.pageTemplates,
        sections: data.sections,
      });
      setPages(computed);
      setSkipped(skippedSections);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogId]);

  if (loading) return <p className="text-sm text-slate-400">Montando catálogo...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {catalogNome}
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Ver catálogo</h1>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {skipped.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">
            {skipped.length === 1 ? "1 seção não aparece no catálogo:" : `${skipped.length} seções não aparecem no catálogo:`}
          </p>
          <ul className="mt-1 list-disc pl-4">
            {skipped.map((s) => (
              <li key={s.id}>
                {s.titulo} — {MOTIVO_LABEL[s.motivo]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && pages.length === 0 && !error && (
        <p className="mt-4 text-sm text-slate-400">
          Nenhuma página pra mostrar ainda — adicione produtos a alguma seção primeiro.
        </p>
      )}

      {pages.length > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <p className="text-sm text-slate-600">
              Página {current + 1} de {pages.length}
              {pages[current].sectionTitulo ? ` — ${pages[current].sectionTitulo}` : ""}
            </p>
            <button
              onClick={() => setCurrent((c) => Math.min(pages.length - 1, c + 1))}
              disabled={current === pages.length - 1}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Próxima →
            </button>
          </div>

          <div className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
            <PreviewPageCanvas
              page={pages[current]}
              paginaLargura={paginaLargura}
              paginaAltura={paginaAltura}
              numeroPagina={current + 1}
            />
          </div>
        </>
      )}
    </div>
  );
}
