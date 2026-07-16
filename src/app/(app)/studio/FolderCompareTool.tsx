"use client";

import { useState } from "react";
import FolderPickerZone, { type LazyFileEntry } from "@/components/FolderPickerZone";
import InfoTooltip from "@/components/InfoTooltip";

const IMG_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"];

function stemOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

type Pendente = {
  key: string;
  stem: string;
  entry: LazyFileEntry;
};

type Props = {
  // Manda as fotos pendentes (já resolvidas via getFile) pro Aplicador
  // de Marca — quem chama decide o que fazer com elas (StudioPage troca
  // pra aba Marca d'água e injeta no lote de lá).
  onApplyMarca: (files: File[]) => void;
};

// Porta ComparadorPastas._comparar (removedor_fundo.py:2619-2664):
// identifica por nome sem extensão (ignora .png vs .jpg), case-
// insensitive — fotos que estão na pasta A mas não na B. Só compara
// NOMES (entry.name) — nenhum arquivo é lido nessa etapa, só os que
// sobrarem como pendentes têm o conteúdo lido de fato, um a um, na
// hora de aplicar a marca.
function compararPastas(entriesA: LazyFileEntry[], entriesB: LazyFileEntry[]) {
  const mapA = new Map<string, Pendente>();
  for (const e of entriesA) {
    const key = stemOf(e.name).toLowerCase();
    mapA.set(key, { key, stem: stemOf(e.name), entry: e });
  }
  const keysB = new Set(entriesB.map((e) => stemOf(e.name).toLowerCase()));
  const pendentes = [...mapA.values()]
    .filter((p) => !keysB.has(p.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  return { pendentes, totalA: mapA.size, totalB: keysB.size };
}

export default function FolderCompareTool({ onApplyMarca }: Props) {
  const [entriesA, setEntriesA] = useState<LazyFileEntry[]>([]);
  const [entriesB, setEntriesB] = useState<LazyFileEntry[]>([]);
  const [resultado, setResultado] = useState<{ pendentes: Pendente[]; totalA: number; totalB: number } | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  function handleComparar() {
    setResultado(compararPastas(entriesA, entriesB));
  }

  function limpar() {
    setEntriesA([]);
    setEntriesB([]);
    setResultado(null);
  }

  async function handleApplyMarcaOne(p: Pendente) {
    setApplyingKey(p.key);
    try {
      const file = await p.entry.getFile();
      onApplyMarca([file]);
    } finally {
      setApplyingKey(null);
    }
  }

  async function handleApplyMarcaAll() {
    if (!resultado || resultado.pendentes.length === 0) return;
    setApplyingAll(true);
    try {
      const files = await Promise.all(resultado.pendentes.map((p) => p.entry.getFile()));
      onApplyMarca(files);
    } finally {
      setApplyingAll(false);
    }
  }

  const podeComparar = entriesA.length > 0 && entriesB.length > 0;

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
            Selecionar a pasta só lista os nomes dos arquivos — nenhuma foto é lida nessa etapa. Só as que sobrarem
            como pendentes têm o conteúdo aberto de fato, na hora de aplicar a marca.
          </p>
          <p>
            &quot;Aplicar marca d&apos;água&quot; manda as fotos pendentes direto pro Aplicador de Marca, já
            carregadas — não precisa selecionar os arquivos de novo lá.
          </p>
        </InfoTooltip>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FolderPickerZone
          label="Pasta A — fotos sem marca"
          count={entriesA.length}
          extensions={IMG_EXTS}
          onEntries={setEntriesA}
        />
        <FolderPickerZone
          label="Pasta B — fotos com marca"
          count={entriesB.length}
          extensions={IMG_EXTS}
          onEntries={setEntriesB}
        />
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
                  onClick={handleApplyMarcaAll}
                  disabled={applyingAll}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  title="Manda todas as fotos pendentes pro Aplicador de Marca"
                >
                  {applyingAll ? "Enviando..." : "Aplicar marca d'água (todas)"}
                </button>
              </div>

              <div className="mt-2 max-h-80 overflow-auto rounded border border-slate-200">
                {resultado.pendentes.map((p) => (
                  <div key={p.key} className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-sm last:border-b-0">
                    <span className="truncate text-slate-700" title={p.entry.name}>
                      {p.entry.name}
                    </span>
                    <button
                      onClick={() => handleApplyMarcaOne(p)}
                      disabled={applyingKey === p.key}
                      className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {applyingKey === p.key ? "Enviando..." : "Aplicar marca d'água"}
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
