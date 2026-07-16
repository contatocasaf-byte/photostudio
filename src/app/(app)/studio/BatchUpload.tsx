"use client";

import { useState } from "react";
import { removeBackgroundForFile } from "./removeBackground";
import { getPublicUrl } from "@/lib/storage/public-url";
import PhotoEditor from "./editor/PhotoEditor";
import { saveEditedImage } from "./editor/saveEdit";
import { downloadUrl, downloadAllAsZip, downloadBlob, zipBlobs, pngFilenameFor, jpgFilenameFor } from "./download";
import { compressImageFromUrl } from "./compress";
import FilePickerZone from "./FilePickerZone";

const MAX_LOTE = 50;

type ItemStatus = "pendente" | "processando" | "pronto" | "erro";

type BatchItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: ItemStatus;
  resultKey?: string;
  resultUrl?: string;
  originalUrl?: string;
  error?: string;
};

// Evita colisão de nome dentro do zip se dois arquivos originais tiverem
// o mesmo nome base.
function uniqueName(usedNames: Set<string>, filename: string) {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let n = 2;
  let candidate = `${base}_${n}${ext}`;
  while (usedNames.has(candidate)) {
    n++;
    candidate = `${base}_${n}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

export default function BatchUpload() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [compressingId, setCompressingId] = useState<string | null>(null);
  const [compressingAll, setCompressingAll] = useState(false);

  function handleSelect(fileList: FileList | null) {
    if (!fileList) return;
    let files = Array.from(fileList);
    setWarning(null);
    if (files.length > MAX_LOTE) {
      setWarning(`Selecionadas ${files.length} fotos — só as primeiras ${MAX_LOTE} foram carregadas (limite do lote).`);
      files = files.slice(0, MAX_LOTE);
    }
    setItems(
      files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pendente",
      }))
    );
  }

  async function processAll() {
    setProcessing(true);
    // Processa um de cada vez (sem fila no servidor) — mesma UX de
    // progresso item-a-item do app desktop original.
    for (const item of items) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "processando" } : i)));
      try {
        const { originalKey, resultKey } = await removeBackgroundForFile(item.file);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "pronto",
                  resultKey,
                  resultUrl: getPublicUrl(resultKey),
                  originalUrl: getPublicUrl(originalKey),
                }
              : i
          )
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
    setProcessing(false);
  }

  async function handleSaveEdit(id: string, blob: Blob) {
    const item = items.find((i) => i.id === id);
    if (!item?.resultKey) return;
    await saveEditedImage(item.resultKey, blob);
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              resultUrl: `${getPublicUrl(item.resultKey!)}?t=${Date.now()}`,
              // A foto processada agora tem outro formato (canvas fixo da
              // exportação) — a original não serve mais como fonte de cor
              // sem distorcer numa reedição.
              originalUrl: undefined,
            }
          : i
      )
    );
    setEditingId(null);
  }

  async function handleDownloadOne(item: BatchItem) {
    if (!item.resultUrl) return;
    setDownloadingId(item.id);
    try {
      await downloadUrl(item.resultUrl, pngFilenameFor(item.file.name));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDownloadAll() {
    const prontos = items.filter((i) => i.status === "pronto" && i.resultUrl);
    if (prontos.length === 0) return;
    setDownloadingAll(true);
    try {
      const usedNames = new Set<string>();
      const zipItems = prontos.map((i) => ({
        url: i.resultUrl!,
        filename: uniqueName(usedNames, pngFilenameFor(i.file.name)),
      }));
      await downloadAllAsZip(zipItems, `fotos-sem-fundo-${Date.now()}.zip`);
    } finally {
      setDownloadingAll(false);
    }
  }

  async function handleDownloadOneCompressed(item: BatchItem) {
    if (!item.resultUrl) return;
    setCompressingId(item.id);
    try {
      const blob = await compressImageFromUrl(item.resultUrl);
      downloadBlob(blob, jpgFilenameFor(item.file.name));
    } finally {
      setCompressingId(null);
    }
  }

  async function handleDownloadAllCompressed() {
    const prontos = items.filter((i) => i.status === "pronto" && i.resultUrl);
    if (prontos.length === 0) return;
    setCompressingAll(true);
    try {
      const usedNames = new Set<string>();
      const zipItems = await Promise.all(
        prontos.map(async (i) => ({
          blob: await compressImageFromUrl(i.resultUrl!),
          filename: uniqueName(usedNames, jpgFilenameFor(i.file.name)),
        }))
      );
      await zipBlobs(zipItems, `fotos-sem-fundo-web-${Date.now()}.zip`);
    } finally {
      setCompressingAll(false);
    }
  }

  const total = items.length;
  const prontos = items.filter((i) => i.status === "pronto").length;
  const erros = items.filter((i) => i.status === "erro").length;
  const editingItem = items.find((i) => i.id === editingId);

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
      <FilePickerZone
        multiple
        disabled={processing}
        title="Arraste as fotos aqui ou clique para escolher"
        subtitle={`PNG ou JPG — até ${MAX_LOTE} de uma vez`}
        buttonLabel="Escolher arquivos"
        onFiles={(files) => handleSelect(files)}
      />
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
                onClick={processAll}
                disabled={processing}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {processing ? "Processando..." : "Remover fundo de todas"}
              </button>
              {prontos > 0 && (
                <>
                  <button
                    onClick={handleDownloadAll}
                    disabled={downloadingAll}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {downloadingAll ? "Compactando..." : "Baixar todas (alta resolução, .zip)"}
                  </button>
                  <button
                    onClick={handleDownloadAllCompressed}
                    disabled={compressingAll}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    title="JPEG comprimido (80-120 KB por foto), pronto pra site/rede social"
                  >
                    {compressingAll ? "Comprimindo..." : "Baixar todas comprimidas (.zip)"}
                  </button>
                </>
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
                  {item.status === "processando" && "Removendo fundo..."}
                  {item.status === "pronto" && "Pronto"}
                  {item.status === "erro" && (item.error ?? "Erro")}
                </p>
                {item.status === "pronto" && (
                  <div className="mt-1 flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingId(item.id)}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDownloadOne(item)}
                        disabled={downloadingId === item.id}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {downloadingId === item.id ? "..." : "Baixar"}
                      </button>
                    </div>
                    <button
                      onClick={() => handleDownloadOneCompressed(item)}
                      disabled={compressingId === item.id}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      title="JPEG comprimido (80-120 KB), pronto pra site/rede social"
                    >
                      {compressingId === item.id ? "Comprimindo..." : "Baixar comprimido"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {editingItem?.resultUrl && (
        <PhotoEditor
          imageUrl={editingItem.resultUrl}
          originalImageUrl={editingItem.originalUrl}
          onClose={() => setEditingId(null)}
          onSave={(blob) => handleSaveEdit(editingItem.id, blob)}
        />
      )}
    </div>
  );
}
