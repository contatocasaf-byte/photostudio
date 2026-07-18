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

  const [selectedKey, setSelectedKey] = useState<CardFieldKey | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
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
    if (!habilitado && selectedKey === key) setSelectedKey(null);
    if (!habilitado && alturaCresceCom === key) setAlturaCresceCom(null);
  }

  function handleUpdateField(key: CardFieldKey, patch: Partial<CardImageElementConfig & CardTextElementConfig>) {
    setLayout((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // Campo e forma são seleções mutuamente exclusivas (um Transformer só,
  // compartilhado) — selecionar um sempre limpa o outro, não importa se
  // veio de um clique no canvas ou na lista do painel.
  function handleSelectKey(key: CardFieldKey | null) {
    setSelectedShapeId(null);
    setSelectedKey(key);
  }

  function handleSelectShape(id: string | null) {
    setSelectedKey(null);
    setSelectedShapeId(id);
  }

  function handleAddShape(type: CardShapeType) {
    const shape = defaultCardShape(type, crypto.randomUUID());
    setShapes((prev) => [...prev, shape]);
    handleSelectShape(shape.id);
  }

  function handleUpdateShape(id: string, patch: Partial<CardShape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function handleRemoveShape(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
    if (selectedShapeId === id) setSelectedShapeId(null);
  }

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
            selectedKey={selectedKey}
            onSelect={handleSelectKey}
            gutterMode={gutterMode}
            gutterX={gutterX}
            gutterY={gutterY}
            onGutterChange={handleGutterChange}
            shapes={shapes}
            onShapesChange={setShapes}
            selectedShapeId={selectedShapeId}
            onSelectShape={handleSelectShape}
          />
        </div>
        <PropertiesPanel
          layout={layout}
          camposHabilitados={camposHabilitados}
          onToggleCampo={handleToggleCampo}
          selectedKey={selectedKey}
          onSelectKey={handleSelectKey}
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
          selectedShapeId={selectedShapeId}
          onSelectShape={handleSelectShape}
          onAddShape={handleAddShape}
          onUpdateShape={handleUpdateShape}
          onRemoveShape={handleRemoveShape}
        />
      </div>
    </div>
  );
}
