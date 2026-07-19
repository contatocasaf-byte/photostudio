"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import LayoutPicker, { type SelectedLayout } from "../LayoutPicker";
import LayoutEditorCanvas from "./LayoutEditorCanvas";
import PropertiesPanel from "./PropertiesPanel";
import FontManager from "@/components/fonts/FontManager";
import { defaultConfigForSize, type ElementKey, type LayoutConfig } from "../core/layoutConfig";
import { loadLayoutConfig, saveLayoutConfig } from "../layouts/configClient";

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export default function LayoutEditor() {
  const [layout, setLayout] = useState<SelectedLayout | null>(null);
  const [layoutImg, setLayoutImg] = useState<HTMLImageElement | null>(null);
  const [config, setConfig] = useState<LayoutConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<ElementKey | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [gridDivisions, setGridDivisions] = useState(10);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Adaptador: LayoutEditorCanvas/PropertiesPanel só existem no JSX
  // quando `config` já está carregado (guarda mais abaixo), mas o
  // estado em si é `LayoutConfig | null` (nulo antes de carregar) — daí
  // precisar desse wrapper pra bater com o tipo Dispatch<SetStateAction<LayoutConfig>>
  // que os dois esperam, sem precisar de non-null assertion espalhado.
  const setConfigSafe: Dispatch<SetStateAction<LayoutConfig>> = (action) => {
    setConfig((prev) => {
      if (prev === null) return prev;
      return typeof action === "function" ? (action as (p: LayoutConfig) => LayoutConfig)(prev) : action;
    });
  };

  useEffect(() => {
    // `layout` só vai de null pra um valor (LayoutPicker nunca chama
    // onChange(null)) — layoutImg/config já nascem null, não precisa
    // resetar de volta aqui.
    if (!layout) return;
    let cancelled = false;
    // Precisam disparar já (não dentro do .then) pra "carregando..."
    // aparecer assim que o usuário troca de layout, não só depois que
    // o fetch termina — padrão correto, mesmo que a regra de lint
    // (react-hooks/set-state-in-effect) não distinga esse caso.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setSelectedKey(null);
    setStatus(null);
    Promise.all([loadImageElement(layout.url), loadLayoutConfig(layout)]).then(([img, cfg]) => {
      if (cancelled) return;
      setLayoutImg(img);
      setConfig(cfg);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [layout]);

  async function handleSave() {
    if (!layout || !config) return;
    setSaving(true);
    setStatus(null);
    try {
      const { error } = await saveLayoutConfig(layout.key, config);
      setStatus(error ? `⚠ ${error}` : "✔ Configuração salva.");
    } finally {
      setSaving(false);
    }
  }

  function handleRestoreAll() {
    if (!layout) return;
    if (!confirm("Isso vai restaurar TODAS as posições, cores e textos deste layout para o padrão. Continuar?")) return;
    setConfig(defaultConfigForSize(layout.width, layout.height));
    setSelectedKey(null);
  }

  function handleResetElement(key: ElementKey) {
    if (!layout) return;
    const defaults = defaultConfigForSize(layout.width, layout.height);
    setConfig((prev) => (prev ? { ...prev, [key]: defaults[key] } : prev));
  }

  return (
    <div>
      <p className="text-sm text-slate-500">
        Escolha um layout pra editar posições, textos, cores e alinhamento de cada elemento. Arraste pra
        reposicionar, arraste as bordas/cantos pra redimensionar.
      </p>

      <div className="mt-3">
        <LayoutPicker value={layout} onChange={setLayout} />
        <FontManager />
      </div>

      {loading && <p className="mt-4 text-sm text-slate-400">Carregando layout...</p>}

      {layout && layoutImg && config && !loading && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                Mostrar grade
              </label>
              {showGrid && (
                <select
                  value={gridDivisions}
                  onChange={(e) => setGridDivisions(Number(e.target.value))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  {[4, 6, 8, 10, 12, 20].map((n) => (
                    <option key={n} value={n}>
                      {n} divisões
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRestoreAll}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Restaurar padrão deste layout
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar configuração"}
              </button>
            </div>
          </div>
          {status && <p className="mt-2 text-xs text-slate-500">{status}</p>}

          <div className="mt-4 flex flex-wrap items-start gap-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-[#0f0f23]">
              <LayoutEditorCanvas
                layoutImg={layoutImg}
                config={config}
                onConfigChange={setConfigSafe}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                showGrid={showGrid}
                gridDivisions={gridDivisions}
              />
            </div>
            <PropertiesPanel
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              config={config}
              onChange={setConfigSafe}
              onResetElement={handleResetElement}
            />
          </div>
        </div>
      )}
    </div>
  );
}
