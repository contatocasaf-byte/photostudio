"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  getSection,
  getCardTemplate,
  listCardTemplateVersions,
  listSections,
  saveCardTemplate,
  type CardTemplateVersion,
  type SaveCardTemplateMode,
  type Section,
} from "../../../actions";
import { sectionHasItems } from "../../../produtos/actions";
import {
  defaultCardBorda,
  defaultCardLayout,
  defaultCardShape,
  DEFAULT_CAMPOS_HABILITADOS,
  DEFAULT_CARD_WIDTH,
  DEFAULT_CARD_HEIGHT,
  type CardBorda,
  type CardFieldKey,
  type CardImageElementConfig,
  type CardLayout,
  type CardShape,
  type CardShapeType,
  type CardTextElementConfig,
} from "../../../core/cardConfig";
import CardEditorCanvas from "./CardEditorCanvas";
import { CardStructurePanel, ElementsPanel, SelectedElementPanel } from "./PropertiesPanel";
import FontManager from "@/components/fonts/FontManager";

export default function CardEditorPage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { id: catalogId, sectionId } = use(params);

  const [section, setSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [layout, setLayout] = useState<CardLayout>(() => defaultCardLayout());
  const [camposHabilitados, setCamposHabilitados] = useState<CardFieldKey[]>(DEFAULT_CAMPOS_HABILITADOS);
  const [largura, setLargura] = useState(DEFAULT_CARD_WIDTH);
  const [alturaMinima, setAlturaMinima] = useState(DEFAULT_CARD_HEIGHT);
  const [alturaCresceCom, setAlturaCresceCom] = useState<CardFieldKey | null>("descricao");
  const [gutterX, setGutterX] = useState<number | null>(null);
  const [gutterY, setGutterY] = useState<number | null>(null);
  const [shapes, setShapes] = useState<CardShape[]>([]);
  const [borda, setBorda] = useState<CardBorda>(() => defaultCardBorda());

  // Seleção múltipla (Ctrl+clique adiciona, Alt+clique retira, clique
  // simples substitui — ver SelectMode em CardEditorCanvas.tsx) — um
  // campo/forma pode estar selecionado junto com outros de qualquer tipo.
  const [selectedKeys, setSelectedKeys] = useState<CardFieldKey[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [gutterMode, setGutterMode] = useState(false);

  // Reaproveitar configuração de outra seção do mesmo catálogo — lista
  // as demais seções pra um seletor; "Copiar" só carrega os valores no
  // estado local (igual a abrir o card-molde da outra seção e trazer
  // pra cá), não persiste nada nem religa as duas seções ao mesmo
  // card_templates — o usuário ainda precisa clicar Salvar, e depois
  // disso as duas seções voltam a ser independentes (cada uma com sua
  // própria linha, editável separadamente).
  const [otherSections, setOtherSections] = useState<Section[]>([]);
  const [copySourceId, setCopySourceId] = useState("");
  const [copying, setCopying] = useState(false);

  // Versionamento pós-criação (Fase 5, Parte 8, spec 3.5) — a pergunta
  // "aplicar a todos vs. só aos novos" só faz sentido se a seção já
  // tem produto posicionado; sem isso, Salvar continua direto (sem
  // gerar versão nova, ver saveCardTemplate).
  const [hasItems, setHasItems] = useState(false);
  const [showVersionChoice, setShowVersionChoice] = useState(false);

  // Restaurar versão anterior (Fase 5, Parte 9) — mesma mecânica de
  // "Reaproveitar de outra seção": carrega os dados de uma versão
  // antiga no estado local, o usuário revisa e clica Salvar como
  // sempre (que já cria a versão nova, ver saveCardTemplate). Todas as
  // versões já vêm de uma vez no carregamento inicial, sem round-trip
  // extra ao clicar "Carregar". A primeira da lista (`versao` mais
  // alta) é sempre a versão atual — fica fora da lista de escolha.
  const [versions, setVersions] = useState<CardTemplateVersion[]>([]);
  const [restoreVersionId, setRestoreVersionId] = useState("");
  const olderVersions = versions.slice(1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSection(sectionId),
      getCardTemplate(sectionId),
      listSections(catalogId),
      sectionHasItems(sectionId),
      listCardTemplateVersions(sectionId),
    ]).then(([sectionRes, templateRes, sectionsRes, hasItemsRes, versionsRes]) => {
      if (cancelled) return;
      if (sectionRes.error) setError(sectionRes.error);
      else setSection(sectionRes.section ?? null);
      if (templateRes.error) setError(templateRes.error);
      else if (templateRes.template) {
        const t = templateRes.template;
        // Mescla por cima dos padrões (mesmo padrão já usado no editor
        // de página) — sem isso, um card-molde salvo com uma versão
        // antiga dos campos (ex.: antes da Parte 6a renomear nome/sku/
        // preco pra codigo/ref/preco_1/preco_2) deixa os campos NOVOS
        // com config `undefined`, quebrando o canvas inteiro ao tentar
        // desenhar um campo sem posição/tamanho.
        setLayout({ ...defaultCardLayout(t.largura, t.alturaMinima), ...t.layout });
        setCamposHabilitados(t.camposHabilitados.length > 0 ? t.camposHabilitados : DEFAULT_CAMPOS_HABILITADOS);
        setLargura(t.largura);
        setAlturaMinima(t.alturaMinima);
        setAlturaCresceCom(t.alturaCresceCom);
        setGutterX(t.gutterX);
        setGutterY(t.gutterY);
        setShapes(t.shapes);
        setBorda(t.borda ?? defaultCardBorda());
      }
      if (!sectionsRes.error) setOtherSections((sectionsRes.sections ?? []).filter((s) => s.id !== sectionId));
      if (!hasItemsRes.error) setHasItems(hasItemsRes.hasItems ?? false);
      if (!versionsRes.error) setVersions(versionsRes.versions ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sectionId, catalogId]);

  async function handleCopyFrom() {
    if (!copySourceId) return;
    setCopying(true);
    setStatus(null);
    try {
      const res = await getCardTemplate(copySourceId);
      if (res.error) {
        setStatus(`⚠ ${res.error}`);
        return;
      }
      if (!res.template) {
        setStatus("⚠ Essa seção ainda não tem um card-molde configurado.");
        return;
      }
      const t = res.template;
      setLayout({ ...defaultCardLayout(t.largura, t.alturaMinima), ...t.layout });
      setCamposHabilitados(t.camposHabilitados.length > 0 ? t.camposHabilitados : DEFAULT_CAMPOS_HABILITADOS);
      setLargura(t.largura);
      setAlturaMinima(t.alturaMinima);
      setAlturaCresceCom(t.alturaCresceCom);
      setGutterX(t.gutterX);
      setGutterY(t.gutterY);
      setShapes(t.shapes);
      setBorda(t.borda ?? defaultCardBorda());
      handleClearSelection();
      setStatus("✔ Configuração copiada — clique em Salvar pra aplicar nesta seção.");
    } finally {
      setCopying(false);
    }
  }

  function handleLoadVersion(v: CardTemplateVersion) {
    const t = v.template;
    setLayout({ ...defaultCardLayout(t.largura, t.alturaMinima), ...t.layout });
    setCamposHabilitados(t.camposHabilitados.length > 0 ? t.camposHabilitados : DEFAULT_CAMPOS_HABILITADOS);
    setLargura(t.largura);
    setAlturaMinima(t.alturaMinima);
    setAlturaCresceCom(t.alturaCresceCom);
    setGutterX(t.gutterX);
    setGutterY(t.gutterY);
    setShapes(t.shapes);
    setBorda(t.borda ?? defaultCardBorda());
    handleClearSelection();
    setStatus(`✔ Versão ${v.versao} carregada — clique em Salvar pra restaurar.`);
  }

  function handleToggleCampo(key: CardFieldKey, habilitado: boolean) {
    setCamposHabilitados((prev) => (habilitado ? [...prev, key] : prev.filter((k) => k !== key)));
    if (!habilitado) setSelectedKeys((prev) => prev.filter((k) => k !== key));
    if (!habilitado && alturaCresceCom === key) setAlturaCresceCom(null);
  }

  function handleUpdateField(key: CardFieldKey, patch: Partial<CardImageElementConfig & CardTextElementConfig>) {
    setLayout((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // "replace" (clique simples) troca a seleção inteira por só o item
  // clicado, limpando a seleção do OUTRO tipo também — igual ao
  // comportamento de antes da multi-seleção. "add"/"remove" (Ctrl/Alt)
  // só mexem no próprio array, permitindo misturar campos e formas na
  // mesma seleção.
  function handleSelectField(key: CardFieldKey, mode: "replace" | "add" | "remove") {
    if (mode === "replace") {
      setSelectedShapeIds([]);
      setSelectedKeys([key]);
    } else if (mode === "add") {
      setSelectedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    } else {
      setSelectedKeys((prev) => prev.filter((k) => k !== key));
    }
  }

  function handleSelectShape(id: string, mode: "replace" | "add" | "remove") {
    if (mode === "replace") {
      setSelectedKeys([]);
      setSelectedShapeIds([id]);
    } else if (mode === "add") {
      setSelectedShapeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedShapeIds((prev) => prev.filter((s) => s !== id));
    }
  }

  function handleClearSelection() {
    setSelectedKeys([]);
    setSelectedShapeIds([]);
  }

  function handleAddShape(type: CardShapeType) {
    const shape = defaultCardShape(type, crypto.randomUUID());
    setShapes((prev) => [...prev, shape]);
    handleSelectShape(shape.id, "replace");
  }

  function handleUpdateShape(id: string, patch: Partial<CardShape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function handleRemoveShape(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
    setSelectedShapeIds((prev) => prev.filter((s) => s !== id));
  }

  // Move todo campo/forma selecionado com as setas do teclado (1px, ou
  // 10px com Shift) — ignora quando o foco está num campo de texto do
  // painel de propriedades, senão roubaria a digitação de número/texto.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      if (selectedKeys.length === 0 && selectedShapeIds.length === 0) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      if (selectedKeys.length > 0) {
        setLayout((prev) => {
          const next = { ...prev };
          for (const key of selectedKeys) {
            const cfg = next[key];
            next[key] = { ...cfg, x: (cfg?.x ?? 0) + dx, y: (cfg?.y ?? 0) + dy };
          }
          return next;
        });
      }
      if (selectedShapeIds.length > 0) {
        setShapes((prev) => prev.map((s) => (selectedShapeIds.includes(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s)));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedKeys, selectedShapeIds]);

  function handleResizeBoundary(patch: { largura: number; alturaMinima: number }) {
    setLargura(patch.largura);
    setAlturaMinima(patch.alturaMinima);
  }

  function handleGutterChange(patch: { gutterX: number; gutterY: number }) {
    setGutterX(patch.gutterX);
    setGutterY(patch.gutterY);
  }

  function handleUpdateBorda(patch: Partial<CardBorda>) {
    setBorda((prev) => ({ ...prev, ...patch }));
  }

  // Seção sem produto posicionado ainda: salva direto (modo é
  // irrelevante — saveCardTemplate nem chega a versionar nesse caso).
  // Com produto já posicionado: mostra a escolha antes de salvar de
  // verdade (ver `doSave`).
  function handleSave() {
    if (hasItems) {
      setShowVersionChoice(true);
      return;
    }
    doSave("aplicar_todos");
  }

  async function doSave(modo: SaveCardTemplateMode) {
    setSaving(true);
    setStatus(null);
    setShowVersionChoice(false);
    try {
      const res = await saveCardTemplate(
        sectionId,
        {
          layout,
          largura,
          alturaMinima,
          alturaCresceCom,
          camposHabilitados,
          gutterX,
          gutterY,
          shapes,
          borda,
        },
        modo
      );
      setStatus(res.error ? `⚠ ${res.error}` : "✔ Card-molde salvo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando card-molde...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {section ? section.titulo : "Voltar"}
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Card-molde — {section?.titulo}</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Desenhado com dados de exemplo — a foto e os textos reais entram quando os produtos forem vinculados.
      </p>
      <FontManager />

      {otherSections.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <label className="text-xs text-slate-500">Reaproveitar configuração de:</label>
          <select
            value={copySourceId}
            onChange={(e) => setCopySourceId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Selecione uma seção...</option>
            {otherSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.numero ? `${s.numero} — ${s.titulo}` : s.titulo}
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
      )}

      {olderVersions.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <label className="text-xs text-slate-500">Versões anteriores:</label>
          <select
            value={restoreVersionId}
            onChange={(e) => setRestoreVersionId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Selecione uma versão...</option>
            {olderVersions.map((v) => (
              <option key={v.id} value={v.id}>
                Versão {v.versao} — {new Date(v.criadoEm).toLocaleString("pt-BR")}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const v = olderVersions.find((v) => v.id === restoreVersionId);
              if (v) handleLoadVersion(v);
            }}
            disabled={!restoreVersionId}
            className="rounded-md bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
          >
            Carregar
          </button>
        </div>
      )}

      {showVersionChoice && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p className="font-medium">Esta seção já tem produtos posicionados. Aplicar essa alteração a:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => doSave("aplicar_todos")}
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Todos os produtos já posicionados
            </button>
            <button
              onClick={() => doSave("aplicar_novos")}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Só aos novos a partir de agora
            </button>
            <button
              onClick={() => setShowVersionChoice(false)}
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

      {/* Grid 2x2 (pedido do usuário, pra melhorar usabilidade): canvas
          + ajustes estruturais do card na linha de cima; lista de
          elementos (embaixo do canvas) + propriedades do item
          selecionado (ao lado dessa lista) na linha de baixo. */}
      <div className="mt-4 grid grid-cols-[auto_18rem] items-start gap-4">
        <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          <CardEditorCanvas
            layout={layout}
            onLayoutChange={setLayout}
            camposHabilitados={camposHabilitados}
            largura={largura}
            alturaMinima={alturaMinima}
            onResizeBoundary={handleResizeBoundary}
            selectedKeys={selectedKeys}
            onSelectField={handleSelectField}
            gutterMode={gutterMode}
            gutterX={gutterX}
            gutterY={gutterY}
            onGutterChange={handleGutterChange}
            shapes={shapes}
            onShapesChange={setShapes}
            selectedShapeIds={selectedShapeIds}
            onSelectShape={handleSelectShape}
            onClearSelection={handleClearSelection}
          />
        </div>

        <CardStructurePanel
          largura={largura}
          alturaMinima={alturaMinima}
          onResizeBoundary={handleResizeBoundary}
          gutterMode={gutterMode}
          onToggleGutterMode={setGutterMode}
          gutterX={gutterX}
          gutterY={gutterY}
          onGutterChange={handleGutterChange}
          borda={borda}
          onUpdateBorda={handleUpdateBorda}
        />

        <ElementsPanel
          camposHabilitados={camposHabilitados}
          onToggleCampo={handleToggleCampo}
          selectedKeys={selectedKeys}
          onSelectField={handleSelectField}
          alturaCresceCom={alturaCresceCom}
          onChangeAlturaCresceCom={setAlturaCresceCom}
          shapes={shapes}
          selectedShapeIds={selectedShapeIds}
          onSelectShape={handleSelectShape}
          onAddShape={handleAddShape}
        />

        <SelectedElementPanel
          layout={layout}
          selectedKeys={selectedKeys}
          onUpdateField={handleUpdateField}
          shapes={shapes}
          selectedShapeIds={selectedShapeIds}
          onUpdateShape={handleUpdateShape}
          onRemoveShape={handleRemoveShape}
        />
      </div>
    </div>
  );
}
