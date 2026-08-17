"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCatalog } from "../../../actions";
import {
  getPageTemplate,
  getPageTemplateFieldsById,
  listAllPageTemplates,
  savePageTemplate,
  updateCatalogPageSize,
  type PageTemplateListItem,
  type SegueEscopo,
} from "../../../paginas/actions";
import {
  defaultMargens,
  defaultPageIllustration,
  defaultPageLayout,
  defaultPageShape,
  DEFAULT_ELEMENTOS_HABILITADOS,
  DEFAULT_PAGE_WIDTH,
  DEFAULT_PAGE_HEIGHT,
  PAGE_TIPOS,
  type Margens,
  type PageFieldKey,
  type PageIllustration,
  type PageImageElementConfig,
  type PageLayout,
  type PageShape,
  type PageShapeType,
  type PageTextElementConfig,
  type PageTipo,
} from "../../../core/pageConfig";
import PageEditorCanvas from "./PageEditorCanvas";
import PropertiesPanel from "./PropertiesPanel";
import FontManager from "@/components/fonts/FontManager";

function isPageTipo(v: string): v is PageTipo {
  return PAGE_TIPOS.some((t) => t.value === v);
}

// Serializa só os campos que "Reaproveitar"/"seguir" transferem nesse
// ESCOPO — usado pra comparar "o que está na tela agora" contra "o que
// acabou de ser copiado/carregado", pra saber se o vínculo de seguir
// ainda vale ou já foi quebrado por edição manual. Mesma técnica já
// usada no card-molde (snapshotCard). Escopo "campos" (pedido do
// usuário) ignora margens/fundo/ilustrações/formas de propósito — só
// Banner de Título/Logo/Numeração/Contato/Validade (layout +
// elementosHabilitados) contam pra decidir se ainda está "igual".
function snapshotPageFields(
  escopo: SegueEscopo,
  input: {
    layout: PageLayout;
    elementosHabilitados: PageFieldKey[];
    margens: Margens;
    fundoKey: string | null;
    fundoPdfKey: string | null;
    illustracoes: PageIllustration[];
    formas: PageShape[];
  }
): string {
  if (escopo === "campos") {
    return JSON.stringify({ layout: input.layout, elementosHabilitados: input.elementosHabilitados });
  }
  return JSON.stringify(input);
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
  const [fundoPdfKey, setFundoPdfKey] = useState<string | null>(null);
  const [fundoUrl, setFundoUrl] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<PageFieldKey | null>(null);
  const [illustracoes, setIllustracoes] = useState<PageIllustration[]>([]);
  const [selectedIllustrationId, setSelectedIllustrationId] = useState<string | null>(null);
  const [formas, setFormas] = useState<PageShape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Reaproveitar/"seguir" configuração de qualquer outro modelo de
  // página do catálogo (Capa/Abertura de Seção/Continuação, pedido do
  // usuário: não só dentro do mesmo tipo) — mesma mecânica do
  // card-molde: "Copiar" só carrega os valores no estado local;
  // followSourceId só persiste como vínculo se o Salvar acontecer sem
  // nenhuma edição no meio (ver isFollowDirty).
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [otherTemplates, setOtherTemplates] = useState<PageTemplateListItem[]>([]);
  const [copySourceId, setCopySourceId] = useState("");
  const [copying, setCopying] = useState(false);
  const [followSourceId, setFollowSourceId] = useState<string | null>(null);
  const [copiedSnapshot, setCopiedSnapshot] = useState<string | null>(null);
  // "completo" (padrão, comportamento original) ou "campos" (só Banner
  // de Título/Logo/Numeração/Contato/Validade — pedido do usuário
  // depois de testar: às vezes não quer levar fundo/ilustrações/formas/
  // margens junto). Escolhido ANTES de clicar Copiar; carregado do
  // servidor se este modelo já seguir alguém.
  const [escopoCopia, setEscopoCopia] = useState<SegueEscopo>("completo");
  const [replicarSeguidoras, setReplicarSeguidoras] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!tipo) return;
    let cancelled = false;
    Promise.all([getCatalog(catalogId), getPageTemplate(catalogId, tipo), listAllPageTemplates(catalogId)]).then(
      ([catalogRes, templateRes, allRes]) => {
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
          const t = templateRes.template;
          // Só campos habilitados foram salvos — mescla por cima dos
          // padrões pra qualquer campo desligado já ter uma posição
          // pronta pra quando o usuário religar.
          const merged = { ...defaultPageLayout(largura, altura), ...t.layout };
          setLayout(merged);
          setMargens(t.margens);
          setElementosHabilitados(t.elementosHabilitados);
          setFundoKey(t.fundoKey);
          setFundoPdfKey(t.fundoPdfKey);
          setFundoUrl(t.fundoUrl);
          setIllustracoes(t.illustracoes);
          setFormas(t.formas);
          setTemplateId(t.id);
          setFollowSourceId(t.segueTemplateId);
          setEscopoCopia(t.segueEscopo);
          setCopiedSnapshot(
            snapshotPageFields(t.segueEscopo, {
              layout: merged,
              elementosHabilitados: t.elementosHabilitados,
              margens: t.margens,
              fundoKey: t.fundoKey,
              fundoPdfKey: t.fundoPdfKey,
              illustracoes: t.illustracoes,
              formas: t.formas,
            })
          );
        } else if (catalogRes.catalog) {
          setLayout(defaultPageLayout(catalogRes.catalog.paginaLargura, catalogRes.catalog.paginaAltura));
          setMargens(defaultMargens(catalogRes.catalog.paginaLargura, catalogRes.catalog.paginaAltura));
        }
        if (!allRes.error) setOtherTemplates(allRes.templates ?? []);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [catalogId, tipo]);

  async function handleCopyFrom() {
    if (!copySourceId) return;
    setCopying(true);
    setStatus(null);
    try {
      const res = await getPageTemplateFieldsById(copySourceId);
      if (res.error || !res.template) {
        setStatus(`⚠ ${res.error ?? "Modelo não encontrado."}`);
        return;
      }
      const t = res.template;
      const merged = { ...defaultPageLayout(largura, altura), ...t.layout };
      setLayout(merged);
      setElementosHabilitados(t.elementosHabilitados);
      // Escopo "campos": não mexe em fundo/ilustrações/formas/margens
      // — mantém o que já estava na tela.
      if (escopoCopia === "completo") {
        setMargens(t.margens);
        setFundoKey(t.fundoKey);
        setFundoPdfKey(t.fundoPdfKey);
        setFundoUrl(t.fundoUrl);
        setIllustracoes(t.illustracoes);
        setFormas(t.formas);
      }
      setSelectedKey(null);
      setSelectedIllustrationId(null);
      setSelectedShapeId(null);
      setFollowSourceId(copySourceId);
      setCopiedSnapshot(
        snapshotPageFields(escopoCopia, {
          layout: merged,
          elementosHabilitados: t.elementosHabilitados,
          margens: escopoCopia === "completo" ? t.margens : margens,
          fundoKey: escopoCopia === "completo" ? t.fundoKey : fundoKey,
          fundoPdfKey: escopoCopia === "completo" ? t.fundoPdfKey : fundoPdfKey,
          illustracoes: escopoCopia === "completo" ? t.illustracoes : illustracoes,
          formas: escopoCopia === "completo" ? t.formas : formas,
        })
      );
      setStatus(
        escopoCopia === "campos"
          ? "✔ Campos comuns copiados (Banner/Logo/Numeração/Contato/Validade) — clique em Salvar pra aplicar (fica sincronizado com essa origem enquanto você não editar nada)."
          : "✔ Configuração copiada — clique em Salvar pra aplicar (fica sincronizada com essa origem enquanto você não editar nada)."
      );
    } finally {
      setCopying(false);
    }
  }

  function handleUnfollow() {
    setFollowSourceId(null);
    setCopiedSnapshot(null);
    setStatus("Vínculo removido — clique em Salvar pra confirmar.");
  }

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

  function handleChangeFundo(patch: { key: string | null; url: string | null; pdfKey: string | null }) {
    setFundoKey(patch.key);
    setFundoPdfKey(patch.pdfKey);
    setFundoUrl(patch.url);
  }

  function handleAddIllustracao() {
    const nova = defaultPageIllustration(crypto.randomUUID());
    setIllustracoes((prev) => [...prev, nova]);
    setSelectedKey(null);
    setSelectedIllustrationId(nova.id);
  }

  function handleRemoveIllustracao(id: string) {
    setIllustracoes((prev) => prev.filter((i) => i.id !== id));
    if (selectedIllustrationId === id) setSelectedIllustrationId(null);
  }

  function handleUpdateIllustracao(id: string, patch: Partial<PageIllustration>) {
    setIllustracoes((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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

  // Modelos que seguem ESTE (só depois de existir — ver templateId) —
  // ao salvar, o usuário pode escolher replicar a mudança pra eles.
  const followers = templateId ? otherTemplates.filter((t) => t.segueTemplateId === templateId) : [];

  const currentSnapshot = useMemo(
    () => snapshotPageFields(escopoCopia, { layout, elementosHabilitados, margens, fundoKey, fundoPdfKey, illustracoes, formas }),
    [escopoCopia, layout, elementosHabilitados, margens, fundoKey, fundoPdfKey, illustracoes, formas]
  );
  const isFollowDirty = followSourceId !== null && copiedSnapshot !== null && currentSnapshot !== copiedSnapshot;
  const followSourceLabel = followSourceId ? (otherTemplates.find((t) => t.id === followSourceId)?.label ?? "outro modelo") : null;

  function handleSave() {
    if (followers.length > 0) {
      setReplicarSeguidoras(true);
      setShowConfirm(true);
      return;
    }
    doSave();
  }

  async function doSave() {
    if (!tipo) return;
    setSaving(true);
    setStatus(null);
    setShowConfirm(false);
    try {
      const segueTemplateId = followSourceId !== null && !isFollowDirty ? followSourceId : null;
      const [sizeRes, templateRes] = await Promise.all([
        updateCatalogPageSize(catalogId, { largura, altura }),
        savePageTemplate(
          catalogId,
          tipo,
          { layout, elementosHabilitados, margens, fundoKey, fundoPdfKey, illustracoes, formas },
          segueTemplateId,
          escopoCopia,
          followers.length > 0 && replicarSeguidoras
        ),
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

      {otherTemplates.length > 0 && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Reaproveitar configuração de:</label>
            <select
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">Selecione um modelo...</option>
              {otherTemplates
                .filter((t) => t.id !== templateId && t.segueTemplateId !== templateId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
            </select>
            <button
              onClick={handleCopyFrom}
              disabled={!copySourceId || copying}
              className="rounded-md bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            >
              {copying ? "Copiando..." : "Copiar"}
            </button>
          </div>
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={escopoCopia === "campos"}
              onChange={(e) => setEscopoCopia(e.target.checked ? "campos" : "completo")}
            />
            Só os campos comuns (Banner de Título, Logo, Numeração, Contato, Validade) — não leva fundo/ilustrações/formas/margens
          </label>
          {followSourceId && (
            <p className="mt-2 text-xs text-slate-500">
              {isFollowDirty
                ? "⚠ Alterado desde a cópia — não será salvo como sincronizado."
                : `✓ Será salvo como sincronizado com ${followSourceLabel} — atualizações futuras nele podem ser replicadas aqui.`}{" "}
              <button type="button" onClick={handleUnfollow} className="underline hover:text-slate-700">
                Parar de seguir
              </button>
            </p>
          )}
        </div>
      )}

      {showConfirm && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={replicarSeguidoras}
              onChange={(e) => setReplicarSeguidoras(e.target.checked)}
              className="mt-0.5"
            />
            <span>Replicar esta atualização pros modelos que seguem este: {followers.map((f) => f.label).join(", ")}</span>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={doSave}
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={saving}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-amber-800 hover:underline disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
          fundoPdfKey={fundoPdfKey}
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
