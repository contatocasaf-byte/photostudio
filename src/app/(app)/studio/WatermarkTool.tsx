"use client";

import { useRef, useState } from "react";
import { loadImage, canvasToBlob } from "./editor/canvasUtils";
import { downloadBlob, zipBlobs, pngFilenameFor } from "./download";
import FilePickerZone from "./FilePickerZone";

const MAX_ITENS = 100;
// Mesmo tamanho de canvas usado no export do editor (canvasUtils.ts,
// outSize) — as fotos que saem do Studio já vêm nesse tamanho.
const CANVAS_OUT = 1000;

type ItemStatus = "pendente" | "processando" | "pronto" | "erro";

type MarcaItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: ItemStatus;
  resultBlob?: Blob;
  resultUrl?: string;
  error?: string;
};

// Redimensiona SEM cortar e SEM ampliar (equivalente a Image.thumbnail do
// Pillow no app original) — encaixa dentro de maxW×maxH mantendo
// proporção, só encolhe se for maior que a caixa.
function containFit(img: HTMLImageElement, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  return { width: img.naturalWidth * ratio, height: img.naturalHeight * ratio };
}

// Porta de AplicadorMarca._compor do app original (removedor_fundo.py):
// fundo branco opaco → objeto centralizado → marca d'água encostada no
// canto superior esquerdo → logomarca por cima, mesmo canto. Marca e
// logo não são reposicionadas pela ferramenta — o PNG de cada uma já
// vem pronta do jeito que deve aparecer (desenhada no Canva/Photoshop
// no tamanho final desejado).
async function composeWatermark(
  objectImg: HTMLImageElement,
  watermarkImg: HTMLImageElement,
  logoImg: HTMLImageElement
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_OUT;
  canvas.height = CANVAS_OUT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_OUT, CANVAS_OUT);

  const obj = containFit(objectImg, CANVAS_OUT, CANVAS_OUT);
  ctx.drawImage(objectImg, (CANVAS_OUT - obj.width) / 2, (CANVAS_OUT - obj.height) / 2, obj.width, obj.height);

  const m = containFit(watermarkImg, CANVAS_OUT, CANVAS_OUT);
  ctx.drawImage(watermarkImg, 0, 0, m.width, m.height);

  const l = containFit(logoImg, CANVAS_OUT, CANVAS_OUT);
  ctx.drawImage(logoImg, 0, 0, l.width, l.height);

  return canvas;
}

function AssetPicker({
  label,
  file,
  previewUrl,
  onSelect,
}: {
  label: string;
  file: File | null;
  previewUrl: string | null;
  onSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-slate-200"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #e8eaed 25%, transparent 25%), linear-gradient(-45deg, #e8eaed 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8eaed 75%), linear-gradient(-45deg, transparent 75%, #e8eaed 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
        }}
      >
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={label} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="truncate text-xs text-slate-400">{file ? file.name : "Não selecionada"}</p>
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Selecionar
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function WatermarkTool() {
  const [items, setItems] = useState<MarcaItem[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [marcaFile, setMarcaFile] = useState<File | null>(null);
  const [marcaPreview, setMarcaPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  function handleSelectFiles(fileList: FileList) {
    let files = Array.from(fileList);
    setWarning(null);
    if (items.length + files.length > MAX_ITENS) {
      const permitido = Math.max(0, MAX_ITENS - items.length);
      setWarning(`Máximo ${MAX_ITENS} fotos por lote — ${files.length - permitido} arquivo(s) ignorado(s).`);
      files = files.slice(0, permitido);
    }
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pendente" as ItemStatus,
      })),
    ]);
  }

  function limparLista() {
    setItems([]);
    setWarning(null);
  }

  async function processAll() {
    if (!marcaFile || !logoFile || items.length === 0) return;
    setProcessing(true);
    try {
      const [marcaImg, logoImg] = await Promise.all([loadImage(marcaPreview!), loadImage(logoPreview!)]);
      for (const item of items) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "processando" } : i)));
        try {
          const objImg = await loadImage(item.previewUrl);
          const canvas = await composeWatermark(objImg, marcaImg, logoImg);
          const blob = await canvasToBlob(canvas);
          const resultUrl = URL.createObjectURL(blob);
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: "pronto", resultBlob: blob, resultUrl } : i))
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
      }
    } finally {
      setProcessing(false);
    }
  }

  function resultFilename(item: MarcaItem) {
    return pngFilenameFor(item.file.name).replace(/\.png$/, "_marca.png");
  }

  async function handleDownloadOne(item: MarcaItem) {
    if (!item.resultBlob) return;
    setDownloadingId(item.id);
    try {
      downloadBlob(item.resultBlob, resultFilename(item));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDownloadAll() {
    const prontos = items.filter((i) => i.status === "pronto" && i.resultBlob);
    if (prontos.length === 0) return;
    setDownloadingAll(true);
    try {
      await zipBlobs(
        prontos.map((i) => ({ blob: i.resultBlob!, filename: resultFilename(i) })),
        `fotos-com-marca-${Date.now()}.zip`
      );
    } finally {
      setDownloadingAll(false);
    }
  }

  const total = items.length;
  const prontos = items.filter((i) => i.status === "pronto").length;
  const erros = items.filter((i) => i.status === "erro").length;
  const podeProcessar = !!marcaFile && !!logoFile && total > 0 && !processing;

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
      <p className="text-sm text-slate-500">
        Composição: fundo branco → objeto centralizado → marca d&apos;água → logomarca. Use fotos já processadas no
        Studio (fundo removido, canto transparente).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AssetPicker
          label="Marca d'água"
          file={marcaFile}
          previewUrl={marcaPreview}
          onSelect={(f) => {
            setMarcaFile(f);
            setMarcaPreview(URL.createObjectURL(f));
          }}
        />
        <AssetPicker
          label="Logomarca"
          file={logoFile}
          previewUrl={logoPreview}
          onSelect={(f) => {
            setLogoFile(f);
            setLogoPreview(URL.createObjectURL(f));
          }}
        />
      </div>

      <div className="mt-4">
        <FilePickerZone
          multiple
          disabled={processing}
          title="Arraste as fotos dos produtos aqui ou clique para escolher"
          subtitle={`PNG com fundo removido — até ${MAX_ITENS} de uma vez`}
          buttonLabel="Escolher arquivos"
          onFiles={handleSelectFiles}
        />
      </div>
      {warning && <p className="mt-2 text-sm text-amber-600">{warning}</p>}

      {total > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {total} foto{total > 1 ? "s" : ""} selecionada{total > 1 ? "s" : ""}
              {(prontos > 0 || erros > 0) && ` — ${prontos} pronta${prontos !== 1 ? "s" : ""}, ${erros} com erro`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={limparLista}
                disabled={processing}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Limpar lista
              </button>
              <button
                onClick={processAll}
                disabled={!podeProcessar}
                title={!marcaFile || !logoFile ? "Selecione a marca d'água e a logomarca primeiro" : undefined}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {processing ? "Processando..." : "Aplicar marca ao lote"}
              </button>
              {prontos > 0 && (
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {downloadingAll ? "Compactando..." : "Baixar todas (.zip)"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="rounded border border-slate-200 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.status === "pronto" && item.resultUrl ? item.resultUrl : item.previewUrl}
                  alt={item.file.name}
                  className="aspect-square w-full rounded bg-slate-100 object-contain"
                />
                <p className="mt-1 truncate text-xs text-slate-500" title={item.file.name}>
                  {item.file.name}
                </p>
                <p
                  className={
                    "text-xs " +
                    (item.status === "pronto"
                      ? "text-emerald-700"
                      : item.status === "erro"
                        ? "text-red-600"
                        : item.status === "processando"
                          ? "text-slate-500"
                          : "text-slate-400")
                  }
                >
                  {item.status === "pendente" && "Aguardando"}
                  {item.status === "processando" && "Aplicando marca..."}
                  {item.status === "pronto" && "Pronto"}
                  {item.status === "erro" && (item.error ?? "Erro")}
                </p>
                {item.status === "pronto" && (
                  <button
                    onClick={() => handleDownloadOne(item)}
                    disabled={downloadingId === item.id}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {downloadingId === item.id ? "..." : "Baixar"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
