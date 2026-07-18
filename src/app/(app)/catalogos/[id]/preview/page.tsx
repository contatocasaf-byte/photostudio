"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getCatalogPreviewData } from "../../preview/actions";
import { reflowCatalog, type PreviewPage, type SkippedSection } from "../../core/reflow";
import PreviewPageCanvas, { computeStageSize } from "./PreviewPageCanvas";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

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
  // Stage sempre desenha em resolução real + pixelRatio (nítido, ver
  // PreviewPageCanvas.tsx) — quem encolhe/amplia pra caber na tela ou
  // pra ler de perto é só a apresentação (CSS transform), nunca o
  // desenho em si. 55% como padrão dá uma noção da página inteira sem
  // rolar demais; o usuário ajusta pra ler texto de perto quando
  // precisar.
  const [zoom, setZoom] = useState(0.55);

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

  const stageSize = computeStageSize(paginaLargura, paginaAltura);

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

          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-slate-500">Zoom:</label>
            <button
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              −
            </button>
            <span className="w-10 text-center text-xs text-slate-600">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              +
            </button>
            <button
              onClick={() => setZoom(1)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              100%
            </button>
          </div>

          <div className="mt-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
            {/* O Stage sempre desenha em resolução real (ver
                computeStageSize/PreviewPageCanvas.tsx) — o zoom aqui é
                só apresentação (CSS transform), nunca re-renderiza em
                resolução menor, senão o texto voltaria a ficar
                borrado/corrompido como antes da correção. O wrapper
                externo reserva o espaço JÁ escalado (senão o
                overflow-auto rolaria pro tamanho real, sobrando área
                em branco quando o zoom < 100%). */}
            <div style={{ width: stageSize.width * zoom, height: stageSize.height * zoom }}>
              <div style={{ width: stageSize.width, height: stageSize.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
                {/* key={current} força remontar o Stage/Layer do zero a
                    cada troca de página — sem isso, sobrava um nó
                    "fantasma" do Konva da página anterior (ex.:
                    placeholder de foto desenhado duas vezes, em escalas
                    diferentes) quando os dados de uma página pra outra
                    mudavam bastante (cardScale diferente entre
                    abertura_secao/continuação, nº de cards diferente
                    etc.) — usuário reportou isso na página 4. */}
                <PreviewPageCanvas
                  key={current}
                  page={pages[current]}
                  paginaLargura={paginaLargura}
                  paginaAltura={paginaAltura}
                  numeroPagina={current + 1}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
