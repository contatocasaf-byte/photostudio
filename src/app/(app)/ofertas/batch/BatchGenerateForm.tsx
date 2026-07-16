"use client";

import { useState } from "react";
import FilePickerZone from "@/components/FilePickerZone";
import FolderPickerZone, { type LazyFileEntry } from "@/components/FolderPickerZone";
import { downloadBlob, zipBlobs, uniqueName } from "@/lib/downloadFiles";
import { encontrarFotoProduto, PRODUCT_PHOTO_EXTS } from "../core/findProductPhoto";
import { parsePlanilha, listarProdutosPlanilha, MAX_ITENS_LOTE, type ProdutoRow } from "../core/parsePlanilha";
import { formatarPrecoBR } from "../core/priceFormat";
import { loadImage, loadImageToCanvas } from "../core/fitImageOnCanvas";
import { renderOffer, canvasToJpegBlob } from "../core/renderOffer";
import { loadLayoutConfig } from "../layouts/configClient";
import LayoutPicker, { type SelectedLayout } from "../LayoutPicker";
import type { PhotoTransform } from "../PhotoAdjustWidget";
import type { LayoutConfig } from "../core/layoutConfig";
import BatchItemRow from "./BatchItemRow";
import { currentFotoUrl, type BatchItem } from "./types";

const DEFAULT_TRANSFORM: PhotoTransform = { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 };

function toBRDate(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function itemFilename(item: BatchItem, semPreco: boolean): string {
  const safe = item.codigo.trim().replace(/[^A-Za-z0-9_-]/g, "_") || "produto";
  return `${safe}${semPreco ? "_sem_preco" : ""}.jpg`;
}

export default function BatchGenerateForm() {
  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [planilhaStatus, setPlanilhaStatus] = useState<string | null>(null);
  const [parsingPlanilha, setParsingPlanilha] = useState(false);

  const [pastaEntries, setPastaEntries] = useState<LazyFileEntry[]>([]);

  const [items, setItems] = useState<BatchItem[]>([]);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [layout, setLayout] = useState<SelectedLayout | null>(null);
  const [layoutCfg, setLayoutCfg] = useState<LayoutConfig | null>(null);
  const [semPreco, setSemPreco] = useState(false);
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const boxW = layoutCfg?.product_box.w ?? 1;
  const boxH = layoutCfg?.product_box.h ?? 1;

  async function handleLayoutChange(l: SelectedLayout | null) {
    setLayout(l);
    setLayoutCfg(null);
    if (l) setLayoutCfg(await loadLayoutConfig(l));
  }

  async function handlePlanilha(files: FileList) {
    const file = files[0];
    if (!file) return;
    setParsingPlanilha(true);
    setPlanilhaStatus(null);
    setItems([]);
    try {
      const rows = await parsePlanilha(file);
      setProdutos(rows);
      setPlanilhaStatus(
        rows.length > 0
          ? `✔ ${rows.length} produto(s) encontrados em "${file.name}" — clique em "Carregar lote" abaixo.`
          : `⚠ Nenhum produto reconhecido em "${file.name}" — confira se há uma coluna de código (COD/CÓDIGO).`
      );
    } catch {
      setPlanilhaStatus(`⚠ Não foi possível ler "${file.name}".`);
    } finally {
      setParsingPlanilha(false);
    }
  }

  async function handleCarregarLote() {
    if (produtos.length === 0) return;
    setLoadingBatch(true);
    setBatchStatus(null);
    setExpandedId(null);
    try {
      const { itens, total } = listarProdutosPlanilha(produtos, MAX_ITENS_LOTE);

      const built = await Promise.all(
        itens.map(async (p): Promise<BatchItem> => {
          const found = pastaEntries.length > 0 ? encontrarFotoProduto(pastaEntries, p.codigo) : null;
          const fotoAutoUrl = found ? URL.createObjectURL(await found.getFile()) : null;
          return {
            id: `${p.codigo}-${Math.random().toString(36).slice(2)}`,
            codigo: p.codigo,
            ref: p.ref,
            desc: p.desc,
            precoSp: p.precoSp ? formatarPrecoBR(p.precoSp) : "",
            precoPa: p.precoPa ? formatarPrecoBR(p.precoPa) : "",
            included: true,
            fotoAutoUrl,
            fotoManualUrl: null,
            fotoManualName: null,
            transform: DEFAULT_TRANSFORM,
            status: "pendente",
          };
        })
      );

      setItems(built);
      setBatchStatus(
        total > MAX_ITENS_LOTE
          ? `${built.length} produtos carregados (limite de ${MAX_ITENS_LOTE} por importação — a planilha tem ${total} linhas; as ${total - MAX_ITENS_LOTE} últimas foram ignoradas).`
          : `${built.length} produtos carregados.`
      );
    } finally {
      setLoadingBatch(false);
    }
  }

  function updateItem(id: string, patch: Partial<BatchItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function handleGerarLote() {
    setError(null);
    if (items.length === 0) return;
    if (!layout || !layoutCfg) {
      setError("Selecione um layout para o lote.");
      return;
    }
    if (!semPreco && (!dataIni || !dataFim)) {
      setError("Informe a validade (data inicial e final) do lote, ou marque \"Gerar todas sem preço\".");
      return;
    }
    const incluidos = items.filter((i) => i.included);
    if (incluidos.length === 0) {
      setError("Nenhum item está marcado para geração.");
      return;
    }

    setGenerating(true);
    setProgress({ done: 0, total: incluidos.length });
    try {
      const layoutImg = await loadImage(layout.url);
      let done = 0;

      for (const item of incluidos) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "gerando" } : i)));
        try {
          const fotoUrl = currentFotoUrl(item);
          const productCanvas = fotoUrl ? await loadImageToCanvas(fotoUrl) : null;

          const canvas = renderOffer({
            layoutImg,
            cfg: layoutCfg,
            productCanvas,
            ref: item.ref.trim(),
            desc: item.desc.trim(),
            precoSp: item.precoSp,
            precoPa: item.precoPa,
            dataIni: toBRDate(dataIni),
            dataFim: toBRDate(dataFim),
            mostrarPrecos: !semPreco,
            productTransform: item.transform,
          });
          const blob = await canvasToJpegBlob(canvas, 0.95);
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: "pronto", resultBlob: blob, error: undefined } : i))
          );
        } catch (err) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: "erro", error: err instanceof Error ? err.message : "Erro desconhecido." }
                : i
            )
          );
        }
        done++;
        setProgress({ done, total: incluidos.length });
      }
    } finally {
      setGenerating(false);
    }
  }

  function handleDownloadOne(item: BatchItem) {
    if (!item.resultBlob) return;
    downloadBlob(item.resultBlob, itemFilename(item, semPreco));
  }

  async function handleDownloadAll() {
    const prontos = items.filter((i) => i.status === "pronto" && i.resultBlob);
    if (prontos.length === 0) return;
    setDownloadingAll(true);
    try {
      const usedNames = new Set<string>();
      const zipItems = prontos.map((i) => ({
        blob: i.resultBlob!,
        filename: uniqueName(usedNames, itemFilename(i, semPreco)),
      }));
      await zipBlobs(zipItems, `ofertas-lote-${Date.now()}.zip`);
    } finally {
      setDownloadingAll(false);
    }
  }

  const prontos = items.filter((i) => i.status === "pronto").length;
  const erros = items.filter((i) => i.status === "erro").length;
  const podeCarregar = produtos.length > 0 && !parsingPlanilha;

  return (
    <div>
      {/* Produtos */}
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Produtos</h2>
        <p className="mt-1 text-xs text-slate-400">
          A planilha é obrigatória no modo em lote (até {MAX_ITENS_LOTE} produtos por importação). A pasta de fotos é
          opcional — sem ela, os itens ficam sem foto automática (dá pra trocar manualmente depois de carregar).
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FilePickerZone
            disabled={parsingPlanilha}
            title="Arraste a planilha aqui ou clique para escolher"
            subtitle="Excel (.xlsx) com colunas COD/REF/DESCRIÇÃO/PREÇO SP/PREÇO PA"
            buttonLabel={parsingPlanilha ? "Lendo..." : "Escolher planilha"}
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onFiles={handlePlanilha}
          />
          <FolderPickerZone
            label="Pasta de fotos dos produtos (opcional)"
            count={pastaEntries.length}
            extensions={PRODUCT_PHOTO_EXTS}
            onEntries={setPastaEntries}
          />
        </div>
        {planilhaStatus && <p className="mt-2 text-xs text-slate-500">{planilhaStatus}</p>}

        <button
          onClick={handleCarregarLote}
          disabled={!podeCarregar || loadingBatch}
          className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loadingBatch ? "Carregando..." : "Carregar lote da planilha"}
        </button>
        {batchStatus && <p className="mt-2 text-xs text-slate-500">{batchStatus}</p>}
      </div>

      {/* Configuração comum ao lote */}
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Layout e validade (iguais para todo o lote)</h2>
        <div className="mt-3">
          <LayoutPicker value={layout} onChange={handleLayoutChange} />
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={semPreco} onChange={(e) => setSemPreco(e.target.checked)} />
          Gerar todas SEM preço (institucional)
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Data inicial</label>
            <input
              type="date"
              value={dataIni}
              disabled={semPreco}
              onChange={(e) => setDataIni(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Data final</label>
            <input
              type="date"
              value={dataFim}
              disabled={semPreco}
              onChange={(e) => setDataFim(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Itens */}
      {items.length > 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {items.length} produto{items.length !== 1 ? "s" : ""}
              {(prontos > 0 || erros > 0) && ` — ${prontos} pronta${prontos !== 1 ? "s" : ""}, ${erros} com erro`}
            </h2>
            {prontos > 0 && (
              <button
                onClick={handleDownloadAll}
                disabled={downloadingAll}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {downloadingAll ? "Compactando..." : "Baixar todas prontas (.zip)"}
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {items.map((item, idx) => (
              <BatchItemRow
                key={item.id}
                item={item}
                index={idx}
                expanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                boxW={boxW}
                boxH={boxH}
                onUpdate={(patch) => updateItem(item.id, patch)}
                onDownload={() => handleDownloadOne(item)}
              />
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            onClick={handleGerarLote}
            disabled={generating}
            className="mt-4 w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {generating
              ? `Gerando ${progress?.done ?? 0}/${progress?.total ?? items.length}...`
              : "⚡ Gerar todas as ofertas"}
          </button>
        </div>
      )}
    </div>
  );
}
