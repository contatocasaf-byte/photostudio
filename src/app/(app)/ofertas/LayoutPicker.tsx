"use client";

import { useEffect, useState } from "react";
import { getPublicUrl } from "@/lib/storage/public-url";
import FilePickerZone from "@/components/FilePickerZone";
import { listLayouts, getLayoutUploadUrl, type LayoutEntry } from "./layouts/actions";

export type SelectedLayout = { key: string; url: string; width: number; height: number };

type Props = {
  value: SelectedLayout | null;
  onChange: (layout: SelectedLayout | null) => void;
};

function loadDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

export default function LayoutPicker({ value, onChange }: Props) {
  const [layouts, setLayouts] = useState<LayoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await listLayouts();
    if (res.error) setError(res.error);
    else setLayouts(res.layouts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    listLayouts().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setLayouts(res.layouts ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSelect(entry: LayoutEntry) {
    const url = getPublicUrl(entry.key);
    try {
      const { width, height } = await loadDimensions(url);
      onChange({ key: entry.key, url, width, height });
    } catch {
      setError(`Não foi possível carregar "${entry.name}".`);
    }
  }

  async function handleUpload(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url: uploadUrl, key, error: err } = await getLayoutUploadUrl({
        fileName: file.name,
        contentType: file.type,
      });
      if (err || !uploadUrl || !key) throw new Error(err ?? "Falha ao gerar URL de upload.");

      const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Falha no upload pro R2.");

      await refresh();
      const publicUrl = getPublicUrl(key);
      const { width, height } = await loadDimensions(publicUrl);
      onChange({ key, url: publicUrl, width, height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {loading && <p className="text-sm text-slate-400">Carregando layouts...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && layouts.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {layouts.map((entry) => {
            const selected = value?.key === entry.key;
            return (
              <button
                key={entry.key}
                onClick={() => handleSelect(entry)}
                className={
                  "rounded-md border p-1.5 text-left transition-colors " +
                  (selected ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getPublicUrl(entry.key)}
                  alt={entry.name}
                  className="aspect-square w-full rounded bg-slate-100 object-cover"
                />
                <p className="mt-1 truncate text-xs text-slate-600" title={entry.name}>
                  {entry.name}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <FilePickerZone
          disabled={uploading}
          title="Arraste um layout aqui ou clique para escolher"
          subtitle="JPG ou PNG — vira uma nova opção na lista acima"
          buttonLabel={uploading ? "Enviando..." : "Escolher arquivo"}
          onFiles={handleUpload}
        />
      </div>
    </div>
  );
}
