"use client";

import { useState } from "react";
import { getCatalogItensRelatorio, type CatalogFotoStats, type FotoStats } from "./actions";
import { baixarRelatorioItens } from "./relatorioItens";
import { baixarRelatorioSemFoto } from "./relatorioSemFoto";

export function percentual(s: FotoStats): number | null {
  return s.total === 0 ? null : Math.round((s.comFoto / s.total) * 100);
}

// Resumo geral de cobertura de fotos do catálogo + botões dos
// relatórios (itens sem foto / todos os itens com link das fotos) —
// usado na lista de seções e no "Ver catálogo".
export default function FotoStatsResumo({
  catalogId,
  catalogNome,
  stats,
  loading,
  onRefresh,
}: {
  catalogId: string;
  catalogNome: string;
  stats: CatalogFotoStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [gerandoItens, setGerandoItens] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState<string | null>(null);

  async function handleRelatorioItens() {
    setGerandoItens(true);
    setErroRelatorio(null);
    try {
      const res = await getCatalogItensRelatorio(catalogId);
      if (res.error || !res.itens) setErroRelatorio(res.error ?? "Falha ao montar o relatório.");
      else if (res.itens.length === 0) setErroRelatorio("Este catálogo ainda não tem itens cadastrados.");
      else baixarRelatorioItens(catalogNome, res.itens);
    } catch (e) {
      setErroRelatorio(e instanceof Error ? e.message : "Falha ao montar o relatório.");
    } finally {
      setGerandoItens(false);
    }
  }

  if (!stats) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400">
        {loading ? "Calculando fotos do catálogo..." : "Não foi possível calcular as fotos do catálogo."}
      </div>
    );
  }

  const pct = percentual(stats.geral);
  const completo = pct === 100;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-slate-700">
          Fotos: <b>{stats.geral.comFoto}</b> de <b>{stats.geral.total}</b> itens com foto
          {pct !== null && (
            <span className={`ml-2 font-semibold ${completo ? "text-emerald-700" : "text-amber-700"}`}>{pct}%</span>
          )}
        </p>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${completo ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct ?? 0}%` }} />
        </div>
        <button
          onClick={() => baixarRelatorioSemFoto(catalogNome, stats.semFoto)}
          disabled={stats.semFoto.length === 0}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="Planilha Excel com Código, Referência e Descrição dos itens sem foto"
        >
          Relatório de itens sem foto ({stats.semFoto.length})
        </button>
        <button
          onClick={handleRelatorioItens}
          disabled={gerandoItens || stats.geral.total === 0}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="Planilha Excel com Código, Referência, Descrição e link para as fotos de todos os itens do catálogo"
        >
          {gerandoItens ? "Gerando relatório..." : "Relatório de itens do catálogo"}
        </button>
        <button onClick={onRefresh} disabled={loading} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50">
          {loading ? "Atualizando..." : "↻ Atualizar"}
        </button>
      </div>
      {erroRelatorio && <p className="mt-1 text-[11px] text-red-600">{erroRelatorio}</p>}
      {stats.galeriaIndisponivel && (
        <p className="mt-1 text-[11px] text-amber-700">
          A galeria de fotos não está configurada, está vazia ou falhou ao carregar — por isso todos os itens aparecem sem foto.
        </p>
      )}
    </div>
  );
}
