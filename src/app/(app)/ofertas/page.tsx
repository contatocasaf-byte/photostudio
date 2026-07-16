"use client";

import { useMemo, useState } from "react";
import FilePickerZone from "@/components/FilePickerZone";
import FolderPickerZone from "@/components/FolderPickerZone";
import { defaultConfigForSize } from "./core/layoutConfig";
import { loadImage, loadImageToCanvas } from "./core/fitImageOnCanvas";
import { renderOffer, canvasToJpegBlob } from "./core/renderOffer";
import { formatarPrecoBR } from "./core/priceFormat";
import { directChildrenImages, encontrarFotoProduto } from "./core/findProductPhoto";
import { parsePlanilha, buscarProduto, type ProdutoRow } from "./core/parsePlanilha";
import LayoutPicker, { type SelectedLayout } from "./LayoutPicker";
import PhotoAdjustWidget, { type PhotoTransform } from "./PhotoAdjustWidget";

const DEFAULT_TRANSFORM: PhotoTransform = { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 };

function toBRDate(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export default function OfertasPage() {
  const [codigo, setCodigo] = useState("");
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");
  const [precoSp, setPrecoSp] = useState("");
  const [precoPa, setPrecoPa] = useState("");
  const [semPreco, setSemPreco] = useState(false);
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [planilhaStatus, setPlanilhaStatus] = useState<string | null>(null);
  const [parsingPlanilha, setParsingPlanilha] = useState(false);

  const [pastaFiles, setPastaFiles] = useState<File[]>([]);
  const [fotoStatus, setFotoStatus] = useState("— busque um produto ou envie a foto manualmente");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [transform, setTransform] = useState<PhotoTransform>(DEFAULT_TRANSFORM);

  const [layout, setLayout] = useState<SelectedLayout | null>(null);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState("");

  const layoutCfg = useMemo(() => (layout ? defaultConfigForSize(layout.width, layout.height) : null), [layout]);
  const boxW = layoutCfg?.product_box.w ?? 1;
  const boxH = layoutCfg?.product_box.h ?? 1;

  async function handlePlanilha(files: FileList) {
    const file = files[0];
    if (!file) return;
    setParsingPlanilha(true);
    setPlanilhaStatus(null);
    try {
      const rows = await parsePlanilha(file);
      setProdutos(rows);
      setPlanilhaStatus(
        rows.length > 0
          ? `✔ ${rows.length} produto(s) carregados de "${file.name}"`
          : `⚠ Nenhum produto reconhecido em "${file.name}" — confira se há uma coluna de código (COD/CÓDIGO).`
      );
    } catch {
      setPlanilhaStatus(`⚠ Não foi possível ler "${file.name}".`);
    } finally {
      setParsingPlanilha(false);
    }
  }

  function handleBuscar() {
    const code = codigo.trim();
    if (!code) return;

    const produto = buscarProduto(produtos, code);
    if (produto) {
      setRef(produto.ref);
      setDesc(produto.desc);
      if (produto.precoSp) setPrecoSp(formatarPrecoBR(produto.precoSp));
      if (produto.precoPa) setPrecoPa(formatarPrecoBR(produto.precoPa));
    }

    const found = encontrarFotoProduto(pastaFiles, code);
    if (found) {
      setFotoStatus(`✔ ${found.name}`);
      setFotoUrl(URL.createObjectURL(found));
    } else {
      setFotoStatus(
        pastaFiles.length > 0
          ? "⚠ Nenhuma foto encontrada para este código na pasta selecionada"
          : "⚠ Nenhuma pasta de fotos selecionada — envie a foto manualmente abaixo"
      );
      setFotoUrl(null);
    }
    setTransform(DEFAULT_TRANSFORM);
  }

  function handleFotoManual(files: FileList) {
    const file = files[0];
    if (!file) return;
    setFotoStatus(`✔ ${file.name} (manual)`);
    setFotoUrl(URL.createObjectURL(file));
    setTransform(DEFAULT_TRANSFORM);
  }

  function formatarCampoPreco(valor: string, setValor: (v: string) => void) {
    if (valor.trim()) setValor(formatarPrecoBR(valor));
  }

  async function handleGerar() {
    setError(null);
    setPreviewUrl(null);
    setPreviewBlob(null);

    const faltando: string[] = [];
    if (!codigo.trim()) faltando.push("Código do produto");
    if (!ref.trim()) faltando.push("Referência");
    if (!desc.trim()) faltando.push("Descrição");
    if (!semPreco) {
      if (!precoSp.trim()) faltando.push("Preço SP");
      if (!precoPa.trim()) faltando.push("Preço PA");
      if (!dataIni) faltando.push("Data inicial");
      if (!dataFim) faltando.push("Data final");
    }
    if (!layout || !layoutCfg) faltando.push("Layout");

    if (faltando.length > 0) {
      setError(`Preencha os campos: ${faltando.join(", ")}.`);
      return;
    }

    setGenerating(true);
    try {
      const layoutImg = await loadImage(layout!.url);
      const productCanvas = fotoUrl ? await loadImageToCanvas(fotoUrl) : null;

      const canvas = renderOffer({
        layoutImg,
        cfg: layoutCfg!,
        productCanvas,
        ref: ref.trim(),
        desc: desc.trim(),
        precoSp,
        precoPa,
        dataIni: toBRDate(dataIni),
        dataFim: toBRDate(dataFim),
        mostrarPrecos: !semPreco,
        productTransform: transform,
      });

      const blob = await canvasToJpegBlob(canvas, 0.95);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewBlob(blob);

      const safe = codigo.trim().replace(/[^A-Za-z0-9_-]/g, "_") || "produto";
      setPreviewFilename(`${safe}${semPreco ? "_sem_preco" : ""}.jpg`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar a oferta.");
    } finally {
      setGenerating(false);
    }
  }

  function handleBaixar() {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = previewFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-slate-900">Gerador de Ofertas</h1>
      <p className="mt-1 text-sm text-slate-500">
        Modo individual — layout + foto do produto + preços, tudo gerado no navegador. Editor de layout, biblioteca de
        fontes e modo em lote chegam numa próxima entrega.
      </p>

      {/* Produto */}
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Produto</h2>
        <p className="mt-1 text-xs text-slate-400">
          Planilha e pasta de fotos são opcionais — sem elas, preencha os campos abaixo manualmente e envie a foto
          direto na seção &quot;Foto do Produto&quot;.
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
            count={pastaFiles.length}
            onFiles={(fl) => setPastaFiles(directChildrenImages(fl))}
          />
        </div>
        {planilhaStatus && <p className="mt-2 text-xs text-slate-500">{planilhaStatus}</p>}

        <div className="mt-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600">Código</label>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="ex: 20502"
            />
          </div>
          <button
            onClick={handleBuscar}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Buscar
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{fotoStatus}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Referência</label>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Descrição</label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Layout */}
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Layout</h2>
        <div className="mt-3">
          <LayoutPicker value={layout} onChange={setLayout} />
        </div>
      </div>

      {/* Foto do Produto */}
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Foto do Produto</h2>
        <div className="mt-3">
          <FilePickerZone
            title="Arraste a foto do produto aqui ou clique para escolher"
            subtitle="Substitui a foto encontrada automaticamente pela pasta"
            buttonLabel="Escolher arquivo"
            onFiles={handleFotoManual}
          />
        </div>

        <p className="mt-4 text-xs font-medium text-slate-600">Ajustar enquadramento da foto (opcional):</p>
        <div className="mt-2">
          <PhotoAdjustWidget photoUrl={fotoUrl} boxW={boxW} boxH={boxH} transform={transform} onChange={setTransform} />
        </div>
      </div>

      {/* Preços */}
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Preços</h2>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={semPreco} onChange={(e) => setSemPreco(e.target.checked)} />
          Gerar anúncio SEM preço (institucional)
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Preço SP (R$)</label>
            <input
              value={precoSp}
              disabled={semPreco}
              onChange={(e) => setPrecoSp(e.target.value)}
              onBlur={(e) => formatarCampoPreco(e.target.value, setPrecoSp)}
              placeholder="ex: 99,90"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Preço PA (R$)</label>
            <input
              value={precoPa}
              disabled={semPreco}
              onChange={(e) => setPrecoPa(e.target.value)}
              onBlur={(e) => formatarCampoPreco(e.target.value, setPrecoPa)}
              placeholder="ex: 109,90"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-900">Validade da Oferta</h2>
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

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleGerar}
        disabled={generating}
        className="mt-6 w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {generating ? "Gerando..." : "⚡ Gerar Oferta"}
      </button>

      {/* Pré-visualização */}
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Pré-visualização</h2>
        {!previewUrl && <p className="mt-2 text-sm text-slate-400">A pré-visualização aparecerá aqui após gerar a oferta.</p>}
        {previewUrl && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Prévia da oferta gerada" className="max-w-md rounded border border-slate-200" />
            <button
              onClick={handleBaixar}
              className="mt-3 block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Baixar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
