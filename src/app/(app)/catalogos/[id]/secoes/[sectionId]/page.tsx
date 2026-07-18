"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getSection, getCardTemplate, saveCardTemplate, type Section } from "../../../actions";
import {
  defaultCardLayout,
  defaultCardShape,
  DEFAULT_CAMPOS_HABILITADOS,
  DEFAULT_CARD_WIDTH,
  DEFAULT_CARD_HEIGHT,
  type CardFieldKey,
  type CardImageElementConfig,
  type CardLayout,
  type CardShape,
  type CardShapeType,
  type CardTextElementConfig,
} from "../../../core/cardConfig";
import CardEditorCanvas from "./CardEditorCanvas";
import PropertiesPanel from "./PropertiesPanel";

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

  // Seleção múltipla (Ctrl+clique adiciona, Alt+clique retira, clique
  // simples substitui — ver SelectMode em CardEditorCanvas.tsx) — um
  // campo/forma pode estar selecionado junto com outros de qualquer tipo.
  const [selectedKeys, setSelectedKeys] = useState<CardFieldKey[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [gutterMode, setGutterMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSection(sectionId), getCardTemplate(sectionId)]).then(([sectionRes, templateRes]) => {
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
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

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

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await saveCardTemplate(sectionId, {
        layout,
        largura,
        alturaMinima,
        alturaCresceCom,
        camposHabilitados,
        gutterX,
        gutterY,
        shapes,
      });
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

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {status && <p className="mt-2 text-xs text-slate-500">{status}</p>}

      <div className="mt-4 flex flex-wrap items-start gap-4">
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
        <PropertiesPanel
          layout={layout}
          camposHabilitados={camposHabilitados}
          onToggleCampo={handleToggleCampo}
          selectedKeys={selectedKeys}
          onSelectField={handleSelectField}
          onUpdateField={handleUpdateField}
          largura={largura}
          alturaMinima={alturaMinima}
          onResizeBoundary={handleResizeBoundary}
          alturaCresceCom={alturaCresceCom}
          onChangeAlturaCresceCom={setAlturaCresceCom}
          gutterMode={gutterMode}
          onToggleGutterMode={setGutterMode}
          gutterX={gutterX}
          gutterY={gutterY}
          shapes={shapes}
          selectedShapeIds={selectedShapeIds}
          onSelectShape={handleSelectShape}
          onAddShape={handleAddShape}
          onUpdateShape={handleUpdateShape}
          onRemoveShape={handleRemoveShape}
        />
      </div>
    </div>
  );
}
