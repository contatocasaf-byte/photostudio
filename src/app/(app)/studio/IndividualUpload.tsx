"use client";

import { useState } from "react";
import { removeBackgroundForFile } from "./removeBackground";
import { getPublicUrl } from "@/lib/storage/public-url";

type Status = "idle" | "uploading" | "processing" | "done" | "error";

export default function IndividualUpload() {
  const [status, setStatus] = useState<Status>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResultUrl(null);
    try {
      setStatus("uploading");
      setStatus("processing");
      const resultKey = await removeBackgroundForFile(file);
      setResultUrl(getPublicUrl(resultKey));
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
      setStatus("error");
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
        </div>
      )}
    </div>
  );
}
