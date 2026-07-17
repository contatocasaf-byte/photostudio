"use client";

import { useEffect, useState } from "react";
import { getFontUploadUrl, listFonts, type CustomFontEntry } from "./actions";
import { invalidateCustomFontsCache } from "./fontLoader";

const EXT_BY_MIME: Record<string, "ttf" | "otf" | "woff" | "woff2"> = {
  "font/ttf": "ttf",
  "font/otf": "otf",
  "font/woff": "woff",
  "font/woff2": "woff2",
};

function extFromFile(file: File): "ttf" | "otf" | "woff" | "woff2" | null {
  if (EXT_BY_MIME[file.type]) return EXT_BY_MIME[file.type];
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  return ext === "ttf" || ext === "otf" || ext === "woff" || ext === "woff2" ? ext : null;
}

// Gerenciador de fontes próprias — upload de .ttf/.otf/.woff/.woff2 pro
// R2 (prefixo fontes/). Ao contrário do layout (uma imagem = um
// registro), aqui o arquivo sozinho não diz o nome da família nem o
// peso, então pede os dois antes de subir (vira o nome do arquivo, ver
// ofertas/fonts/actions.ts:parseFontKey).
export default function FontManager() {
  const [fonts, setFonts] = useState<CustomFontEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState<400 | 700>(400);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await listFonts();
    if (res.error) setError(res.error);
    else setFonts(res.fonts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listFonts().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setFonts(res.fonts ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const fam = family.trim();
    if (!fam) {
      setError("Informe o nome da família antes de escolher o arquivo.");
      return;
    }
    const ext = extFromFile(file);
    if (!ext) {
      setError("Formato não reconhecido — use .ttf, .otf, .woff ou .woff2.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const { url: uploadUrl, error: err } = await getFontUploadUrl({ family: fam, weight, ext });
      if (err || !uploadUrl) throw new Error(err ?? "Falha ao gerar URL de upload.");

      const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": `font/${ext}` } });
      if (!putRes.ok) throw new Error("Falha no upload pro R2.");

      invalidateCustomFontsCache();
      await refresh();
      setFamily("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
      >
        Gerenciar fontes próprias
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Minhas fontes</p>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
          Fechar
        </button>
      </div>

      {loading && <p className="mt-2 text-sm text-slate-400">Carregando...</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!loading && fonts.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {fonts.map((f) => (
            <li key={f.key} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm">
              <span>{f.family}</span>
              <span className="text-xs text-slate-400">{f.weight === 700 ? "Negrito" : "Normal"}</span>
            </li>
          ))}
        </ul>
      )}
      {!loading && fonts.length === 0 && <p className="mt-2 text-xs text-slate-400">Nenhuma fonte própria enviada ainda.</p>}

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
        <div className="flex gap-2">
          <input
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            placeholder="Nome da família (ex: Minha Fonte)"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <select
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value) as 400 | 700)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value={400}>Normal</option>
            <option value={700}>Negrito</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400">
          {uploading ? "Enviando..." : "Escolher arquivo (.ttf, .otf, .woff, .woff2)"}
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            disabled={uploading}
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </label>
        <p className="text-[11px] text-slate-400">
          Cada peso (normal/negrito) de uma família é um upload separado — envie os dois se for usar negrito nessa fonte.
        </p>
      </div>
    </div>
  );
}
