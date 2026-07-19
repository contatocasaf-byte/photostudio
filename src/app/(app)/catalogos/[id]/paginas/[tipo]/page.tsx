"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getCatalog } from "../../../actions";
import { getPageTemplate, savePageTemplate, updateCatalogPageSize } from "../../../paginas/actions";
import {
  defaultMargens,
  defaultPageLayout,
  DEFAULT_ELEMENTOS_HABILITADOS,
  DEFAULT_PAGE_WIDTH,
  DEFAULT_PAGE_HEIGHT,
  PAGE_TIPOS,
  type Margens,
  type PageFieldKey,
  type PageImageElementConfig,
  type PageLayout,
  type PageTextElementConfig,
  type PageTipo,
} from "../../../core/pageConfig";
import PageEditorCanvas from "./PageEditorCanvas";
import PropertiesPanel from "./PropertiesPanel";
import FontManager from "@/components/fonts/FontManager";

function isPageTipo(v: string): v is PageTipo {
  return PAGE_TIPOS.some((t) => t.value === v);
}

export default function PageEditorPage({ params }: { params: Promise<{ id: string; tipo: string }> }) {
  const { id: catalogId, tipo: tipoParam } = use(params);
  const tipo: PageTipo | null = isPageTipo(tipoParam) ? tipoParam : null;
  const tipoLabel = PAGE_TIPOS.find((t) => t.value === tipo)?.label ?? tipoParam;

  const [catalogNome, setCatalogNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [layout, setLayout] = useState<PageLayout>(() => defaultPageLayout());
  const [elementosHabilitados, setElementosHabilitados] = useState<PageFieldKey[]>(DEFAULT_ELEMENTOS_HABILITADOS);
  const [largura, setLargura] = useState(DEFAULT_PAGE_WIDTH);
  const [altura, setAltura] = useState(DEFAULT_PAGE_HEIGHT);
  const [margens, setMargens] = useState<Margens>(() => defaultMargens(DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT));
  const [fundoKey, setFundoKey] = useState<string | null>(null);
  const [fundoUrl, setFundoUrl] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<PageFieldKey | null>(null);

  useEffect(() => {
    if (!tipo) return;
    let cancelled = false;
    Promise.all([getCatalog(catalogId), getPageTemplate(catalogId, tipo)]).then(([catalogRes, templateRes]) => {
      if (cancelled) return;
      if (catalogRes.error) setError(catalogRes.error);
      else if (catalogRes.catalog) {
        setCatalogNome(catalogRes.catalog.nome);
        setLargura(catalogRes.catalog.paginaLargura);
        setAltura(catalogRes.catalog.paginaAltura);
      }
      if (templateRes.error) setError(templateRes.error);
      else if (templateRes.template) {
        const largura = catalogRes.catalog?.paginaLargura ?? DEFAULT_PAGE_WIDTH;
        const altura = catalogRes.catalog?.paginaAltura ?? DEFAULT_PAGE_HEIGHT;
        // Só campos habilitados foram salvos — mescla por cima dos
        // padrões pra qualquer campo desligado já ter uma posição
        // pronta pra quando o usuário religar.
        setLayout({ ...defaultPageLayout(largura, altura), ...templateRes.template.layout });
        setMargens(templateRes.template.margens);
        setElementosHabilitados(templateRes.template.elementosHabilitados);
        setFundoKey(templateRes.template.fundoKey);
        setFundoUrl(templateRes.template.fundoUrl);
      } else if (catalogRes.catalog) {
        setLayout(defaultPageLayout(catalogRes.catalog.paginaLargura, catalogRes.catalog.paginaAltura));
        setMargens(defaultMargens(catalogRes.catalog.paginaLargura, catalogRes.catalog.paginaAltura));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogId, tipo]);

  function handleToggleElemento(key: PageFieldKey, habilitado: boolean) {
    setElementosHabilitados((prev) => (habilitado ? [...prev, key] : prev.filter((k) => k !== key)));
    if (!habilitado && selectedKey === key) setSelectedKey(null);
  }

  function handleUpdateField(key: PageFieldKey, patch: Partial<PageImageElementConfig & PageTextElementConfig>) {
    setLayout((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function handleResizeBoundary(patch: { largura: number; altura: number }) {
    setLargura(patch.largura);
    setAltura(patch.altura);
  }

  function handleChangeMargens(patch: Partial<Margens>) {
    setMargens((prev) => ({ ...prev, ...patch }));
  }

  function handleChangeFundo(patch: { key: string | null; url: string | null }) {
    setFundoKey(patch.key);
    setFundoUrl(patch.url);
  }

  async function handleSave() {
    if (!tipo) return;
    setSaving(true);
    setStatus(null);
    try {
      const [sizeRes, templateRes] = await Promise.all([
        updateCatalogPageSize(catalogId, { largura, altura }),
        savePageTemplate(catalogId, tipo, { layout, elementosHabilitados, margens, fundoKey }),
      ]);
      const err = sizeRes.error ?? templateRes.error;
      setStatus(err ? `⚠ ${err}` : "✔ Modelo de página salvo.");
    } finally {
      setSaving(false);
    }
  }

  if (!tipo) {
    return <p className="text-sm text-red-600">Tipo de página inválido: &quot;{tipoParam}&quot;.</p>;
  }
  if (loading) return <p className="text-sm text-slate-400">Carregando modelo de página...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}/paginas`} className="text-xs text-slate-500 hover:text-slate-700">
        ← Modelos de Página — {catalogNome}
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{tipoLabel}</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      <FontManager />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {status && <p className="mt-2 text-xs text-slate-500">{status}</p>}

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          <PageEditorCanvas
            layout={layout}
            onLayoutChange={setLayout}
            elementosHabilitados={elementosHabilitados}
            largura={largura}
            altura={altura}
            onResizeBoundary={handleResizeBoundary}
            margens={margens}
            fundoUrl={fundoUrl}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>
        <PropertiesPanel
          layout={layout}
          elementosHabilitados={elementosHabilitados}
          onToggleElemento={handleToggleElemento}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onUpdateField={handleUpdateField}
          largura={largura}
          altura={altura}
          onResizeBoundary={handleResizeBoundary}
          margens={margens}
          onChangeMargens={handleChangeMargens}
          fundoUrl={fundoUrl}
          onChangeFundo={handleChangeFundo}
        />
      </div>
    </div>
  );
}
