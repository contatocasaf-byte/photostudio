"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCatalogPreviewData } from "../../preview/actions";
import { fontPairsFromPreviewPages, reflowCatalog, type PreviewPage, type SkippedSection } from "../../core/reflow";
import { exportCatalogPdf } from "../../pdf/exportPdf";
import { getCatalogFotoStats, type CatalogFotoStats } from "../../fotos/actions";
import FotoStatsResumo from "../../fotos/FotoStatsResumo";
import { ensureFontsLoaded } from "@/lib/fonts/fontLoader";
import PreviewPageCanvas, { computeStageSize } from "./PreviewPageCanvas";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

const MOTIVO_LABEL: Record<SkippedSection["motivo"], string> = {
  sem_card_molde: "sem card-molde configurado",
  sem_produtos: "sem produtos adicionados",
};

// Número da página atual, editável: clica, digita e Enter (ou sai do campo)
// pra ir direto à página. Valor fora do intervalo vai pra primeira/última;
// texto que não é número é ignorado (volta ao valor atual). Esc cancela.
function PaginaInput({ valor, total, onIr }: { valor: number; total: number; onIr: (pagina: number) => void }) {
  // `rascunho` (estado) é o que aparece no campo; o ref guarda o mesmo valor
  // pra confirmar/cancelar sem depender de closure velha (Enter confirma e
  // depois tira o foco, que dispara o blur de novo).
  const [rascunho, setRascunho] = useState<string | null>(null);
  const pendente = useRef<string | null>(null);

  function atualizar(texto: string | null) {
    pendente.current = texto;
    setRascunho(texto);
  }

  function confirmar() {
    const texto = pendente.current;
    atualizar(null);
    if (texto === null) return;
    const n = parseInt(texto, 10);
    if (Number.isNaN(n)) return;
    onIr(Math.min(total, Math.max(1, n)));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={rascunho ?? String(valor)}
      onFocus={(e) => {
        atualizar(String(valor));
        e.target.select();
      }}
      onChange={(e) => atualizar(e.target.value.replace(/\D/g, ""))}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          confirmar();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          atualizar(null);
          e.currentTarget.blur();
        }
      }}
      aria-label={`Ir para a página (1 a ${total})`}
      title={`Digite o número da página (1 a ${total}) e tecle Enter`}
      className="w-14 rounded-md border border-slate-300 px-2 py-1 text-center text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
    />
  );
}

export default function CatalogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: catalogId } = use(params);

  const [catalogNome, setCatalogNome] = useState<string | null>(null);
  const [validadeTexto, setValidadeTexto] = useState("");
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<string | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const [fotoStats, setFotoStats] = useState<CatalogFotoStats | null>(null);
  const [fotoStatsLoading, setFotoStatsLoading] = useState(true);

  async function loadFotoStats() {
    setFotoStatsLoading(true);
    try {
      const res = await getCatalogFotoStats(catalogId);
      if (res.stats) setFotoStats(res.stats);
    } finally {
      setFotoStatsLoading(false);
    }
  }

  // Só depois do catálogo montado: as chamadas de servidor do cliente
  // rodam em fila (uma por vez), e esta é pesada — ver CatalogDetailClient.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    getCatalogFotoStats(catalogId).then((res) => {
      if (cancelled) return;
      if (res.stats) setFotoStats(res.stats);
      setFotoStatsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogId, loading]);

  async function handleExportPdf() {
    setExporting(true);
    setExportError(null);
    setExportInfo(null);
    try {
      const { fotosFalharam } = await exportCatalogPdf({
        pages,
        paginaLargura,
        paginaAltura,
        catalogNome: catalogNome ?? "catalogo",
        validadeTexto,
        onProgress: setExportInfo,
      });
      setExportInfo(
        fotosFalharam > 0
          ? `⚠ PDF gerado, mas ${fotosFalharam} foto(s) não puderam ser incluídas (falha ao baixar do Drive ou enviar). Tente gerar de novo.`
          : null
      );
    } catch (e) {
      setExportInfo(null);
      setExportError(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  }

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
      setValidadeTexto(data.validadeTexto);
      setPaginaLargura(data.paginaLargura);
      setPaginaAltura(data.paginaAltura);
      const { pages: computed, skipped: skippedSections } = reflowCatalog({
        paginaLargura: data.paginaLargura,
        paginaAltura: data.paginaAltura,
        pageTemplates: data.pageTemplates,
        sections: data.sections,
        paginasAvulsas: data.paginasAvulsas,
      });
      setPages(computed);
      setSkipped(skippedSections);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogId]);

  // Pré-carrega toda fonte usada no catálogo (Fase 5, Parte 11) antes
  // de desenhar — fontsTick força os canvases de texto já memoizados
  // (PreviewPageCanvas.tsx) a recalcular quando a fonte real termina de
  // baixar depois do primeiro desenho (que já acontece com a fonte de
  // fallback, pra não travar a tela esperando).
  useEffect(() => {
    if (pages.length === 0) return;
    let cancelled = false;
    ensureFontsLoaded(fontPairsFromPreviewPages(pages)).then(() => {
      if (!cancelled) setFontsTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [pages]);

  const stageSize = computeStageSize(paginaLargura, paginaAltura);

  if (loading) return <p className="text-sm text-slate-400">Montando catálogo...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {catalogNome}
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Ver catálogo</h1>
        <button
          onClick={handleExportPdf}
          disabled={exporting || pages.length === 0}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {exporting ? "Gerando PDF..." : "Baixar PDF"}
        </button>
      </div>

      <FotoStatsResumo catalogId={catalogId} catalogNome={catalogNome ?? ""} stats={fotoStats} loading={fotoStatsLoading} onRefresh={loadFotoStats} />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {exportError && <p className="mt-2 text-sm text-red-600">{exportError}</p>}
      {exportInfo && <p className="mt-2 text-sm text-slate-600">{exportInfo}</p>}

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
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrent(0)}
                disabled={current === 0}
                title="Primeira página"
                aria-label="Primeira página"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                «
              </button>
              <button
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                disabled={current === 0}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Anterior
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <span>Página</span>
              <PaginaInput valor={current + 1} total={pages.length} onIr={(n) => setCurrent(n - 1)} />
              <span>
                de {pages.length}
                {pages[current].sectionTitulo ? ` — ${pages[current].sectionTitulo}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrent((c) => Math.min(pages.length - 1, c + 1))}
                disabled={current === pages.length - 1}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Próxima →
              </button>
              <button
                onClick={() => setCurrent(pages.length - 1)}
                disabled={current === pages.length - 1}
                title="Última página"
                aria-label="Última página"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                »
              </button>
            </div>
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
                  validadeTexto={validadeTexto}
                  fontsTick={fontsTick}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
