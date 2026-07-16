"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  ELEMENT_DEFS,
  ELEMENT_PLACEHOLDERS,
  type ElementKey,
  type ImageElementConfig,
  type LayoutConfig,
  type TextAlign,
  type TextElementConfig,
} from "../core/layoutConfig";

type Props = {
  selectedKey: ElementKey | null;
  onSelectKey: (key: ElementKey) => void;
  config: LayoutConfig;
  onChange: Dispatch<SetStateAction<LayoutConfig>>;
  onResetElement: (key: ElementKey) => void;
};

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
  { value: "justify", label: "Justificado" },
];

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="number"
        defaultValue={Math.round(value)}
        key={value}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onCommit(n);
        }}
        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
      />
    </div>
  );
}

export default function PropertiesPanel({ selectedKey, onSelectKey, config, onChange, onResetElement }: Props) {
  const selectedDef = selectedKey ? ELEMENT_DEFS.find((d) => d.key === selectedKey) : null;

  function updateImage(patch: Partial<ImageElementConfig>) {
    if (!selectedKey) return;
    onChange((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...patch } }));
  }
  function updateText(patch: Partial<TextElementConfig>) {
    if (!selectedKey) return;
    onChange((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...patch } }));
  }

  return (
    <div className="w-72 shrink-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Elementos</p>
      <div className="mt-2 flex flex-col gap-1">
        {ELEMENT_DEFS.map((def) => (
          <button
            key={def.key}
            onClick={() => onSelectKey(def.key)}
            className={
              "rounded-md px-2 py-1.5 text-left text-xs font-medium " +
              (selectedKey === def.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
            }
          >
            {def.label}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        {!selectedDef && (
          <p className="text-xs text-slate-400">
            Clique num elemento (na lista acima ou na imagem) pra editar.
          </p>
        )}

        {selectedDef && selectedDef.type === "image" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-slate-900">{selectedDef.label}</p>
            <NumberField
              label="Posição X"
              value={(config[selectedDef.key] as ImageElementConfig).x}
              onCommit={(v) => updateImage({ x: v })}
            />
            <NumberField
              label="Posição Y"
              value={(config[selectedDef.key] as ImageElementConfig).y}
              onCommit={(v) => updateImage({ y: v })}
            />
            <NumberField
              label="Largura"
              value={(config[selectedDef.key] as ImageElementConfig).w}
              onCommit={(v) => updateImage({ w: Math.max(20, v) })}
            />
            <NumberField
              label="Altura"
              value={(config[selectedDef.key] as ImageElementConfig).h}
              onCommit={(v) => updateImage({ h: Math.max(20, v) })}
            />
            <button
              onClick={() => onResetElement(selectedDef.key)}
              className="mt-2 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Restaurar este elemento
            </button>
          </div>
        )}

        {selectedDef && selectedDef.type === "text" && (
          <TextProperties
            elementDef={selectedDef}
            cfg={config[selectedDef.key] as TextElementConfig}
            onUpdate={updateText}
            onReset={() => onResetElement(selectedDef.key)}
          />
        )}
      </div>
    </div>
  );
}

function TextProperties({
  elementDef,
  cfg,
  onUpdate,
  onReset,
}: {
  elementDef: (typeof ELEMENT_DEFS)[number];
  cfg: TextElementConfig;
  onUpdate: (patch: Partial<TextElementConfig>) => void;
  onReset: () => void;
}) {
  const placeholders = ELEMENT_PLACEHOLDERS[elementDef.key];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-slate-900">{elementDef.label}</p>

      <div>
        <label className="text-xs text-slate-500">Texto</label>
        <input
          key={cfg.text}
          defaultValue={cfg.text}
          onBlur={(e) => onUpdate({ text: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        {placeholders && placeholders.length > 0 ? (
          <p className="mt-1 text-[11px] text-slate-400">
            Pode usar: {placeholders.map((p) => (
              <code key={p} className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">
                {p}
              </code>
            ))}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400">Texto fixo — sem valor dinâmico neste elemento.</p>
        )}
      </div>

      <NumberField label="Tamanho da fonte" value={cfg.fontSize} onCommit={(v) => onUpdate({ fontSize: Math.max(8, v) })} />
      <NumberField label="Largura máxima" value={cfg.maxW} onCommit={(v) => onUpdate({ maxW: Math.max(40, v) })} />
      <NumberField label="Posição X" value={cfg.x} onCommit={(v) => onUpdate({ x: v })} />
      <NumberField label="Posição Y" value={cfg.y} onCommit={(v) => onUpdate({ y: v })} />

      <div>
        <label className="text-xs text-slate-500">Número de linhas</label>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => onUpdate({ maxLines: n })}
              className={
                "flex-1 rounded-md px-2 py-1 text-xs font-medium " +
                (cfg.maxLines === n ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500">Alinhamento</label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {ALIGN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ align: opt.value })}
              className={
                "rounded-md px-2 py-1 text-xs font-medium " +
                (cfg.align === opt.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-500">Cor</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={cfg.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-slate-300"
          />
          <input
            key={cfg.color}
            defaultValue={cfg.color}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onUpdate({ color: v });
            }}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500">Peso da fonte</label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <button
            onClick={() => onUpdate({ fontWeight: "normal" })}
            className={
              "rounded-md px-2 py-1 text-xs font-medium " +
              (cfg.fontWeight === "normal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
            }
          >
            Normal
          </button>
          <button
            onClick={() => onUpdate({ fontWeight: "bold" })}
            className={
              "rounded-md px-2 py-1 text-xs font-medium " +
              (cfg.fontWeight === "bold" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
            }
          >
            Negrito
          </button>
        </div>
      </div>

      <button onClick={onReset} className="mt-2 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
        Restaurar este elemento
      </button>
    </div>
  );
}
