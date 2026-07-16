"use client";

import { useState } from "react";
import { removeBackgroundForFile } from "./removeBackground";
import { getPublicUrl } from "@/lib/storage/public-url";
import PhotoEditor from "./editor/PhotoEditor";
import { saveEditedImage } from "./editor/saveEdit";
import { downloadUrl, pngFilenameFor } from "./download";

type Status = "idle" | "uploading" | "processing" | "done" | "error";

export default function IndividualUpload() {
  const [status, setStatus] = useState<Status>("idle");
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fileName, setFileName] = useState<string>("foto.png");
  const [downloading, setDownloading] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setResultUrl(null);
    setResultKey(null);
    setOriginalUrl(null);
    setFileName(pngFilenameFor(file.name));
    try {
      setStatus("uploading");
      setStatus("processing");
      const { originalKey, resultKey: key } = await removeBackgroundForFile(file);
      setResultKey(key);
      setResultUrl(getPublicUrl(key));
      setOriginalUrl(getPublicUrl(originalKey));
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
      setStatus("error");
    }
  }

  async function handleSaveEdit(blob: Blob) {
    if (!resultKey) return;
    await saveEditedImage(resultKey, blob);
    setResultUrl(`${getPublicUrl(resultKey)}?t=${Date.now()}`);
    // A partir daqui a foto processada tem outro formato/proporção (canvas
    // fixo 1000x1000 da exportação) — a original (proporção da câmera) não
    // serve mais como fonte de cor sem distorcer. Uma reedição usa a
    // própria foto processada como cor, igual ao caso "sem original".
    setOriginalUrl(null);
    setEditing(false);
  }

  async function handleDownload() {
    if (!resultUrl) return;
    setDownloading(true);
    try {
      await downloadUrl(resultUrl, fileName);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
      <input
        type="file"
        accept="image/*"
        disabled={status === "uploading" || status === "processing"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {status === "uploading" && <p className="mt-4 text-sm text-slate-500">Enviando foto...</p>}
      {status === "processing" && (
        <p className="mt-4 text-sm text-slate-500">
          Removendo fundo (pode demorar mais na primeira chamada, se o backend estiver
          &quot;dormindo&quot;)...
        </p>
      )}
      {status === "error" && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {resultUrl && (
        <div className="mt-4">
          <p className="text-sm text-emerald-700">Pronto:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="Resultado sem fundo" className="mt-2 max-w-xs rounded border" />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Editar
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {downloading ? "Baixando..." : "Baixar"}
            </button>
          </div>
        </div>
      )}

      {editing && resultUrl && (
        <PhotoEditor
          imageUrl={resultUrl}
          originalImageUrl={originalUrl ?? undefined}
          onClose={() => setEditing(false)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
