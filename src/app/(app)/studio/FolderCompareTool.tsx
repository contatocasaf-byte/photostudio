"use client";

import { useState } from "react";
import { compressImageFromUrl } from "./compress";
import { downloadBlob, zipBlobs } from "./download";
import FolderPickerZone from "./FolderPickerZone";
import InfoTooltip from "./InfoTooltip";

const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]);

function extOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

function stemOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

// Só os arquivos diretamente dentro da pasta selecionada (sem
// subpastas) — mesmo comportamento não-recursivo de os.listdir() no
// app original.
function directChildrenImages(files: FileList) {
  return Array.from(files).filter((f) => {
    const rel = f.webkitRelativePath;
    if (rel && rel.split("/").length !== 2) return false;
    return IMG_EXTS.has(extOf(f.name));
  });
}

type Pendente = {
  key: string;
  stem: string;
  file: File;
};

// Porta ComparadorPastas._comparar (removedor_fundo.py:2619-2664):
// identifica por nome sem extensão (ignora .png vs .jpg), case-
// insensitive — fotos que estão na pasta A mas não na B.
function compararPastas(filesA: File[], filesB: File[]) {
  const mapA = new Map<string, Pendente>();
  for (const f of filesA) mapA.set(stemOf(f.name).toLowerCase(), { key: stemOf(f.name).toLowerCase(), stem: stemOf(f.name), file: f });
  const keysB = new Set(filesB.map((f) => stemOf(f.name).toLowerCase()));
  const pendentes = [...mapA.values()]
    .filter((p) => !keysB.has(p.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { pendentes, totalA: mapA.size, totalB: keysB.size };
}

export default function FolderCompareTool() {
  const [filesA, setFilesA] = useState<File[]>([]);
  const [filesB, setFilesB] = useState<File[]>([]);
  const [resultado, setResultado] = useState<{ pendentes: Pendente[]; totalA: number; totalB: number } | null>(null);
  const [compressingAll, setCompressingAll] = useState(false);
  const [compressingKey, setCompressingKey] = useState<string | null>(null);

  function handleComparar() {
    setResultado(compararPastas(filesA, filesB));
  }

  function limpar() {
    setFilesA([]);
    setFilesB([]);
    setResultado(null);
  }

  async function handleDownloadOne(p: Pendente) {
    setCompressingKey(p.key);
    try {
      const blob = await compressImageFromUrl(URL.createObjectURL(p.file));
      downloadBlob(blob, `${p.stem}.jpg`);
    } finally {
      setCompressingKey(null);
    }
  }

  async function handleDownloadAll() {
    if (!resultado || resultado.pendentes.length === 0) return;
    setCompressingAll(true);
    try {
      const zipItems = await Promise.all(
        resultado.pendentes.map(async (p) => ({
          blob: await compressImageFromUrl(URL.createObjectURL(p.file)),
          filename: `${p.stem}.jpg`,
        }))
      );
      await zipBlobs(zipItems, `fotos-pendentes-${Date.now()}.zip`);
    } finally {
      setCompressingAll(false);
    }
  }

  const podeComparar = filesA.length > 0 && filesB.length > 0;

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
      <div className="flex items-start gap-2">
        <p className="text-sm text-slate-500">
          Compara duas pastas por nome de arquivo (ignora a extensão) e identifica quais fotos da Pasta A ainda não
          têm versão correspondente na Pasta B.
        </p>
        <InfoTooltip title="Como funciona o Comparador de Pastas">
          <p>
            Pensado pro fluxo: Pasta A = fotos já processadas (sem marca), Pasta B = fotos que já passaram pelo
            Aplicador de Marca (com marca). O comparador aponta quais ainda faltam passar pela marca d&apos;água.
          </p>
          <p>
            A comparação é por <strong>nome do arquivo sem extensão</strong>, sem diferenciar maiúsculas/minúsculas —
            <code>produto1.png</code> na Pasta A conta como já feito se existir <code>produto1.jpg</code> na Pasta B.
          </p>
          <p>Só os arquivos diretamente dentro da pasta selecionada contam (subpastas são ignoradas).</p>
          <p>
            Pra cada foto pendente, gera uma cópia comprimida (80-120&nbsp;KB) pronta pra passar pelo Aplicador de
            Marca ou subir direto pro site/rede social.
          </p>
        </InfoTooltip>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FolderPickerZone label="Pasta A — fotos sem marca" count={filesA.length} onFiles={(fl) => setFilesA(directChildrenImages(fl))} />
        <FolderPickerZone label="Pasta B — fotos com marca" count={filesB.length} onFiles={(fl) => setFilesB(directChildrenImages(fl))} />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleComparar}
          disabled={!podeComparar}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Comparar pastas
        </button>
        <button onClick={limpar} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Limpar
        </button>
      </div>

      {resultado && (
        <div className="mt-4">
          {resultado.pendentes.length === 0 ? (
            <p className="text-sm font-medium text-emerald-700">
              Todas as {resultado.totalA} fotos já possuem versão com marca!
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-amber-600">
                  {resultado.pendentes.length} foto(s) pendente(s) (de {resultado.totalA} sem marca / {resultado.totalB}{" "}
                  com marca)
                </p>
                <button
                  onClick={handleDownloadAll}
                  disabled={compressingAll}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  title="JPEG comprimido (80-120 KB) por foto, num .zip só"
                >
                  {compressingAll ? "Compactando..." : "Baixar todas comprimidas (.zip)"}
                </button>
              </div>

              <div className="mt-2 max-h-80 overflow-auto rounded border border-slate-200">
                {resultado.pendentes.map((p) => (
                  <div key={p.key} className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-sm last:border-b-0">
                    <span className="truncate text-slate-700" title={p.file.name}>
                      {p.file.name}
                    </span>
                    <button
                      onClick={() => handleDownloadOne(p)}
                      disabled={compressingKey === p.key}
                      className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {compressingKey === p.key ? "Comprimindo..." : "Baixar comprimida"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
