"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getCatalog, setCatalogAberturaDefault } from "../../actions";
import {
  createAberturaSecaoTemplate,
  deleteAberturaSecaoTemplate,
  getPageTemplate,
  listAberturaSecaoTemplates,
  type AberturaSecaoListItem,
} from "../../paginas/actions";
import { PAGE_TIPOS, type PageTipo } from "../../core/pageConfig";
import { useRouter } from "next/navigation";

function AberturaSecaoList({
  catalogId,
  templates,
  defaultId,
  onChange,
}: {
  catalogId: string;
  templates: AberturaSecaoListItem[];
  defaultId: string | null;
  onChange: () => void;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!nome.trim()) return;
    setSaving(true);
    try {
      const res = await createAberturaSecaoTemplate(catalogId, nome);
      if (res.id) router.push(`/catalogos/${catalogId}/paginas/abertura/${res.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(id: string) {
    await setCatalogAberturaDefault(catalogId, id);
    onChange();
  }

  async function handleDelete(t: AberturaSecaoListItem) {
    if (!confirm(`Excluir a abertura de seção "${t.nome}"?`)) return;
    await deleteAberturaSecaoTemplate(t.id);
    onChange();
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-900">Abertura de Seção</span>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700">
            + Nova abertura
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Cada seção pode usar uma variante própria ou herdar a marcada como padrão do catálogo.
      </p>

      {templates.length === 0 && !showForm && <p className="mt-2 text-xs text-slate-400">Nenhuma abertura de seção criada ainda.</p>}

      {templates.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{t.nome}</span>
              <span className={"shrink-0 text-[11px] " + (t.configurado ? "text-emerald-700" : "text-slate-400")}>
                {t.configurado ? "Configurado" : "Não configurado"}
              </span>
              {defaultId === t.id ? (
                <span className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">Padrão</span>
              ) : (
                <button
                  onClick={() => handleSetDefault(t.id)}
                  className="shrink-0 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-white"
                >
                  Usar como padrão
                </button>
              )}
              <Link
                href={`/catalogos/${catalogId}/paginas/abertura/${t.id}`}
                className="shrink-0 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-white"
              >
                Editar
              </Link>
              <button
                onClick={() => handleDelete(t)}
                className="shrink-0 rounded-md border border-red-200 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-50"
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
            placeholder="Nome da abertura (ex.: Rolamentos)"
            className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            onClick={handleCreate}
            disabled={saving || !nome.trim()}
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar"}
          </button>
          <button
            onClick={() => setShowForm(false)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

export default function PaginasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: catalogId } = use(params);
  const [catalogNome, setCatalogNome] = useState<string | null>(null);
  const [status, setStatus] = useState<Partial<Record<PageTipo, boolean>>>({});
  const [aberturaTemplates, setAberturaTemplates] = useState<AberturaSecaoListItem[]>([]);
  const [aberturaDefaultId, setAberturaDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAberturas() {
    const [catalogRes, templatesRes] = await Promise.all([getCatalog(catalogId), listAberturaSecaoTemplates(catalogId)]);
    if (catalogRes.error) setError(catalogRes.error);
    else setAberturaDefaultId(catalogRes.catalog?.aberturaSecaoDefaultId ?? null);
    if (templatesRes.error) setError(templatesRes.error);
    else setAberturaTemplates(templatesRes.templates ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCatalog(catalogId),
      listAberturaSecaoTemplates(catalogId),
      ...PAGE_TIPOS.map((t) => getPageTemplate(catalogId, t.value)),
    ]).then(([catalogRes, templatesRes, ...templateResults]) => {
      if (cancelled) return;
      if (catalogRes.error) setError(catalogRes.error);
      else {
        setCatalogNome(catalogRes.catalog?.nome ?? "");
        setAberturaDefaultId(catalogRes.catalog?.aberturaSecaoDefaultId ?? null);
      }
      if (templatesRes.error) setError(templatesRes.error);
      else setAberturaTemplates(templatesRes.templates ?? []);

      const next: Partial<Record<PageTipo, boolean>> = {};
      PAGE_TIPOS.forEach((t, i) => {
        const res = templateResults[i];
        if (res.error) setError(res.error);
        next[t.value] = !!res.template;
      });
      setStatus(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogId]);

  if (loading) return <p className="text-sm text-slate-400">Carregando modelos de página...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {catalogNome}
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Modelos de Página</h1>
      <p className="mt-1 text-sm text-slate-500">
        Cabeçalho e rodapé de cada tipo de página deste catálogo. O tamanho da página é compartilhado entre todos os
        modelos.
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {PAGE_TIPOS.map((t) => (
          <Link
            key={t.value}
            href={`/catalogos/${catalogId}/paginas/${t.value}`}
            className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
          >
            <span className="text-sm font-medium text-slate-900">{t.label}</span>
            <span className={"text-xs " + (status[t.value] ? "text-emerald-700" : "text-slate-400")}>
              {status[t.value] ? "Configurado" : "Não configurado"}
            </span>
          </Link>
        ))}

        <AberturaSecaoList catalogId={catalogId} templates={aberturaTemplates} defaultId={aberturaDefaultId} onChange={loadAberturas} />
      </div>
    </div>
  );
}
