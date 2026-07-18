"use client";

import { useEffect, useState } from "react";
import FilePickerZone from "@/components/FilePickerZone";
import { parsePlanilhaProdutos } from "../core/parsePlanilhaProdutos";
import { listPlanilhas, createPlanilhaComProdutos, setCatalogPlanilha, type Planilha } from "./actions";

type Props = {
  catalogId: string;
  value: string | null;
  onChange: (planilhaId: string) => void;
};

// Mesmo padrão de ofertas/LayoutPicker.tsx: lista entidades já
// existentes pra reaproveitar + formulário de upload de uma nova. Aqui
// a seleção já persiste na hora (setCatalogPlanilha), diferente do
// LayoutPicker (que só atualiza estado local de um formulário maior) —
// não existe um botão "Salvar" global na tela do catálogo.
export default function PlanilhaPicker({ catalogId, value, onChange }: Props) {
  const [planilhas, setPlanilhas] = useState<Planilha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    const res = await listPlanilhas();
    if (res.error) setError(res.error);
    else setPlanilhas(res.planilhas ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    listPlanilhas().then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setPlanilhas(res.planilhas ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSelect(id: string) {
    setError(null);
    const res = await setCatalogPlanilha(catalogId, id);
    if (res.error) {
      setError(res.error);
      return;
    }
    onChange(id);
  }

  async function handleUpload(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;
    if (!nomeNovo.trim()) {
      setError("Informe um nome pra planilha antes de escolher o arquivo.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const produtos = await parsePlanilhaProdutos(file);
      const res = await createPlanilhaComProdutos(nomeNovo, produtos);
      if (res.error || !res.id) throw new Error(res.error ?? "Falha ao importar planilha.");

      await refresh();
      setNomeNovo("");
      await handleSelect(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {loading && <p className="text-sm text-slate-400">Carregando planilhas...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && planilhas.length > 0 && (
        <div className="flex flex-col gap-1">
          {planilhas.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              className={
                "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                (value === p.id ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400")
              }
            >
              <span className="font-medium text-slate-900">{p.nome}</span>
              <span className="shrink-0 text-xs text-slate-400">
                {p.produtoCount} produto{p.produtoCount === 1 ? "" : "s"} · {new Date(p.criadoEm).toLocaleDateString("pt-BR")}
              </span>
            </button>
          ))}
        </div>
      )}
      {!loading && planilhas.length === 0 && (
        <p className="text-sm text-slate-400">Nenhuma planilha enviada ainda.</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={nomeNovo}
          onChange={(e) => setNomeNovo(e.target.value)}
          placeholder="Nome da nova planilha (ex: Peças Roçadeiras - Julho 2026)"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <FilePickerZone
          disabled={uploading}
          title="Arraste uma planilha aqui ou clique para escolher"
          subtitle="Excel com colunas COD/REF/DESCRIÇÃO/PREÇO 1/PREÇO 2"
          buttonLabel={uploading ? "Importando..." : "Escolher arquivo"}
          accept=".xlsx,.xls"
          onFiles={handleUpload}
        />
      </div>
    </div>
  );
}
