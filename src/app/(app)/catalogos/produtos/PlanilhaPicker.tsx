"use client";

import { useEffect, useRef, useState } from "react";
import FilePickerZone from "@/components/FilePickerZone";
import { parsePlanilhaProdutos } from "../core/parsePlanilhaProdutos";
import { listPlanilhas, createPlanilhaComProdutos, atualizarPlanilha, setCatalogPlanilha, deletePlanilha, type Planilha } from "./actions";

type Props = {
  catalogId: string;
  value: string | null;
  onChange: (planilhaId: string) => void;
  podeExcluir: boolean;
};

// Mesmo padrão de ofertas/LayoutPicker.tsx: lista entidades já
// existentes pra reaproveitar + formulário de upload de uma nova. Aqui
// a seleção já persiste na hora (setCatalogPlanilha), diferente do
// LayoutPicker (que só atualiza estado local de um formulário maior) —
// não existe um botão "Salvar" global na tela do catálogo.
export default function PlanilhaPicker({ catalogId, value, onChange, podeExcluir }: Props) {
  const [planilhas, setPlanilhas] = useState<Planilha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null);
  const updateFileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpdateRef = useRef<{ id: string; nome: string } | null>(null);

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

  async function handleDelete(id: string, nome: string) {
    if (!window.confirm(`Excluir a planilha "${nome}" e todos os seus produtos? Essa ação não pode ser desfeita.`)) return;
    setExcluindoId(id);
    setError(null);
    const res = await deletePlanilha(id);
    setExcluindoId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await refresh();
  }

  function handleUpdateClick(id: string, nome: string) {
    pendingUpdateRef.current = { id, nome };
    updateFileInputRef.current?.click();
  }

  async function handleUpdateFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const pending = pendingUpdateRef.current;
    // Sempre limpa o valor do input, mesmo se cancelado — senão
    // escolher o MESMO arquivo de novo não dispara onChange de novo.
    e.target.value = "";
    if (!file || !pending) return;

    const confirmado = window.confirm(
      `Atualizar a planilha "${pending.nome}" com os dados de "${file.name}"?\n\n` +
        `Produtos com o mesmo código terão referência/descrição/preços substituídos pelos valores do novo arquivo. ` +
        `Códigos novos serão adicionados. Produtos que não estiverem mais no arquivo NÃO são removidos automaticamente.`
    );
    if (!confirmado) return;

    setAtualizandoId(pending.id);
    setError(null);
    try {
      const produtos = await parsePlanilhaProdutos(file);
      const res = await atualizarPlanilha(pending.id, produtos);
      if (res.error) throw new Error(res.error);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setAtualizandoId(null);
    }
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
      {/* Compartilhado por todas as linhas — handleUpdateClick guarda em
          pendingUpdateRef QUAL planilha antes de disparar o click(). */}
      <input ref={updateFileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUpdateFileChange} className="hidden" />

      {loading && <p className="text-sm text-slate-400">Carregando planilhas...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && planilhas.length > 0 && (
        <div className="flex flex-col gap-1">
          {planilhas.map((p) => (
            <div
              key={p.id}
              className={
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors " +
                (value === p.id ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400")
              }
            >
              <button onClick={() => handleSelect(p.id)} className="flex min-w-0 flex-1 items-center justify-between text-left">
                <span className="min-w-0 truncate font-medium text-slate-900">{p.nome}</span>
                <span className="ml-2 shrink-0 text-xs text-slate-400">
                  {p.produtoCount} produto{p.produtoCount === 1 ? "" : "s"} · {new Date(p.criadoEm).toLocaleDateString("pt-BR")}
                </span>
              </button>
              <button
                onClick={() => handleUpdateClick(p.id, p.nome)}
                disabled={atualizandoId === p.id}
                className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {atualizandoId === p.id ? "Atualizando..." : "Atualizar"}
              </button>
              {podeExcluir && (
                <button
                  onClick={() => handleDelete(p.id, p.nome)}
                  disabled={excluindoId === p.id}
                  className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  {excluindoId === p.id ? "Excluindo..." : "Excluir"}
                </button>
              )}
            </div>
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
