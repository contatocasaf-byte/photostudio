"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getCatalog } from "../../../actions";
import { updateCatalogPageSize } from "../../../paginas/actions";
import { getPaginaAvulsa, savePaginaAvulsaTemplate, updatePaginaAvulsaTitulo } from "../../../paginas-avulsas/actions";
import {
  defaultMargens,
  defaultPageIllustration,
  defaultPageLayout,
  defaultPageShape,
  DEFAULT_ELEMENTOS_HABILITADOS,
  DEFAULT_PAGE_WIDTH,
  DEFAULT_PAGE_HEIGHT,
  type Margens,
  type PageFieldKey,
  type PageIllustration,
  type PageImageElementConfig,
  type PageLayout,
  type PageShape,
  type PageShapeType,
  type PageTextElementConfig,
} from "../../../core/pageConfig";
// Reaproveita os mesmos componentes do editor de página "de tipo fixo"
// (Fase 5, Parte 12) — nenhum dos dois tem lógica específica de tipo,
// só operam sobre layout/margens/tamanho, então servem igual pra uma
// página avulsa.
import PageEditorCanvas from "../../paginas/[tipo]/PageEditorCanvas";
import PropertiesPanel from "../../paginas/[tipo]/PropertiesPanel";
import FontManager from "@/components/fonts/FontManager";

export default function PaginaAvulsaEditorPage({ params }: { params: Promise<{ id: string; avulsaId: string }> }) {
  const { id: catalogId, avulsaId } = use(params);

  const [titulo, setTitulo] = useState("");
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
  const [illustracoes, setIllustracoes] = useState<PageIllustration[]>([]);
  const [selectedIllustrationId, setSelectedIllustrationId] = useState<string | null>(null);
  const [formas, setFormas] = useState<PageShape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPaginaAvulsa(avulsaId), getCatalog(catalogId)]).then(([avulsaRes, catalogRes]) => {
      if (cancelled) return;
      if (avulsaRes.error || !avulsaRes.avulsa) {
        setError(avulsaRes.error ?? "Página avulsa não encontrada.");
        setLoading(false);
        return;
      }
      const { avulsa } = avulsaRes;
      const paginaLargura = catalogRes.catalog?.paginaLargura ?? DEFAULT_PAGE_WIDTH;
      const paginaAltura = catalogRes.catalog?.paginaAltura ?? DEFAULT_PAGE_HEIGHT;
      setTitulo(avulsa.titulo);
      setLargura(paginaLargura);
      setAltura(paginaAltura);
      // Só campos habilitados foram salvos — mescla por cima dos
      // padrões (mesmo padrão já usado no editor de página fixo).
      setLayout({ ...defaultPageLayout(paginaLargura, paginaAltura), ...avulsa.template.layout });
      setMargens(avulsa.template.margens);
      setElementosHabilitados(avulsa.template.elementosHabilitados);
      setFundoKey(avulsa.template.fundoKey);
      setFundoUrl(avulsa.template.fundoUrl);
      setIllustracoes(avulsa.template.illustracoes);
      setFormas(avulsa.template.formas);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [avulsaId, catalogId]);

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

  function handleAddIllustracao() {
    const nova = defaultPageIllustration(crypto.randomUUID());
    setIllustracoes((prev) => [...prev, nova]);
    setSelectedKey(null);
    setSelectedIllustrationId(nova.id);
  }

  function handleRemoveIllustracao(idIll: string) {
    setIllustracoes((prev) => prev.filter((i) => i.id !== idIll));
    if (selectedIllustrationId === idIll) setSelectedIllustrationId(null);
  }

  function handleUpdateIllustracao(idIll: string, patch: Partial<PageIllustration>) {
    setIllustracoes((prev) => prev.map((i) => (i.id === idIll ? { ...i, ...patch } : i)));
  }

  function handleAddForma(type: PageShapeType) {
    const nova = defaultPageShape(type, crypto.randomUUID());
    setFormas((prev) => [...prev, nova]);
    setSelectedKey(null);
    setSelectedIllustrationId(null);
    setSelectedShapeId(nova.id);
  }

  function handleRemoveForma(id: string) {
    setFormas((prev) => prev.filter((s) => s.id !== id));
    if (selectedShapeId === id) setSelectedShapeId(null);
  }

  function handleUpdateForma(id: string, patch: Partial<PageShape>) {
    setFormas((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const [sizeRes, tituloRes, templateRes] = await Promise.all([
        updateCatalogPageSize(catalogId, { largura, altura }),
        updatePaginaAvulsaTitulo(avulsaId, titulo),
        savePaginaAvulsaTemplate(avulsaId, { layout, elementosHabilitados, margens, fundoKey, illustracoes, formas }),
      ]);
      const err = sizeRes.error ?? tituloRes.error ?? templateRes.error;
      setStatus(err ? `⚠ ${err}` : "✔ Página avulsa salva.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando página avulsa...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← Voltar ao catálogo
      </Link>

      <div className="mt-2 flex items-center justify-between gap-3">
        <input
          key={titulo}
          defaultValue={titulo}
          onBlur={(e) => setTitulo(e.target.value)}
          placeholder="Título da página avulsa"
          className="w-full max-w-sm rounded-md border border-slate-300 px-2 py-1.5 text-lg font-semibold text-slate-900"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Página avulsa — layout próprio, não compartilhado com nenhum outro modelo.
      </p>

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
            illustracoes={illustracoes}
            onIllustracoesChange={setIllustracoes}
            selectedIllustrationId={selectedIllustrationId}
            onSelectIllustration={setSelectedIllustrationId}
            formas={formas}
            onFormasChange={setFormas}
            selectedShapeId={selectedShapeId}
            onSelectShape={setSelectedShapeId}
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
          illustracoes={illustracoes}
          onAddIllustracao={handleAddIllustracao}
          onRemoveIllustracao={handleRemoveIllustracao}
          onUpdateIllustracao={handleUpdateIllustracao}
          selectedIllustrationId={selectedIllustrationId}
          onSelectIllustration={setSelectedIllustrationId}
          formas={formas}
          onAddForma={handleAddForma}
          onRemoveForma={handleRemoveForma}
          onUpdateForma={handleUpdateForma}
          selectedShapeId={selectedShapeId}
          onSelectShape={setSelectedShapeId}
        />
      </div>
    </div>
  );
}
