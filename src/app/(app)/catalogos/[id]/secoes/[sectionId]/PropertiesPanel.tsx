"use client";

import {
  CARD_FIELD_DEFS,
  CARD_SHAPE_TYPES,
  type CardBorda,
  type CardFieldKey,
  type CardImageElementConfig,
  type CardLayout,
  type CardShape,
  type CardShapeType,
  type CardTextElementConfig,
} from "../../../core/cardConfig";
import type { TextAlign } from "@/lib/canvasText";

type SelectMode = "replace" | "add" | "remove";

function getClickMode(e: React.MouseEvent): SelectMode {
  if (e.altKey) return "remove";
  if (e.ctrlKey || e.metaKey) return "add";
  return "replace";
}

type Props = {
  layout: CardLayout;
  camposHabilitados: CardFieldKey[];
  onToggleCampo: (key: CardFieldKey, habilitado: boolean) => void;
  // Seleção múltipla — Ctrl+clique numa linha da lista adiciona,
  // Alt+clique retira, clique simples substitui (mesma convenção do
  // canvas, ver SelectMode em CardEditorCanvas.tsx).
  selectedKeys: CardFieldKey[];
  onSelectField: (key: CardFieldKey, mode: SelectMode) => void;
  onUpdateField: (key: CardFieldKey, patch: Partial<CardImageElementConfig & CardTextElementConfig>) => void;
  largura: number;
  alturaMinima: number;
  onResizeBoundary: (patch: { largura: number; alturaMinima: number }) => void;
  alturaCresceCom: CardFieldKey | null;
  onChangeAlturaCresceCom: (key: CardFieldKey | null) => void;
  gutterMode: boolean;
  onToggleGutterMode: (v: boolean) => void;
  gutterX: number | null;
  gutterY: number | null;
  shapes: CardShape[];
  selectedShapeIds: string[];
  onSelectShape: (id: string, mode: SelectMode) => void;
  onAddShape: (type: CardShapeType) => void;
  onUpdateShape: (id: string, patch: Partial<CardShape>) => void;
  onRemoveShape: (id: string) => void;
  borda: CardBorda;
  onUpdateBorda: (patch: Partial<CardBorda>) => void;
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

export default function PropertiesPanel({
  layout,
  camposHabilitados,
  onToggleCampo,
  selectedKeys,
  onSelectField,
  onUpdateField,
  largura,
  alturaMinima,
  onResizeBoundary,
  alturaCresceCom,
  onChangeAlturaCresceCom,
  gutterMode,
  onToggleGutterMode,
  gutterX,
  gutterY,
  shapes,
  selectedShapeIds,
  onSelectShape,
  onAddShape,
  onUpdateShape,
  onRemoveShape,
  borda,
  onUpdateBorda,
}: Props) {
  const selectionCount = selectedKeys.length + selectedShapeIds.length;
  const selectedDef = selectedKeys.length === 1 ? CARD_FIELD_DEFS.find((d) => d.key === selectedKeys[0]) : null;
  const selectedShape = selectedShapeIds.length === 1 ? shapes.find((s) => s.id === selectedShapeIds[0]) : null;
  const camposTexto = CARD_FIELD_DEFS.filter((d) => d.type === "text" && camposHabilitados.includes(d.key));

  return (
    <div className="w-72 shrink-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tamanho do card</p>
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 p-2">
        <NumberField label="Largura" value={largura} onCommit={(v) => onResizeBoundary({ largura: Math.max(60, v), alturaMinima })} />
        <NumberField
          label="Altura mínima"
          value={alturaMinima}
          onCommit={(v) => onResizeBoundary({ largura, alturaMinima: Math.max(60, v) })}
        />
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Campos</p>
      <div className="mt-2 flex flex-col gap-1">
        {CARD_FIELD_DEFS.map((def) => {
          const habilitado = camposHabilitados.includes(def.key);
          return (
            <div
              key={def.key}
              className={
                "flex items-center gap-2 rounded-md px-2 py-1.5 " +
                (selectedKeys.includes(def.key) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700")
              }
            >
              <input
                type="checkbox"
                checked={habilitado}
                onChange={(e) => onToggleCampo(def.key, e.target.checked)}
                className="shrink-0"
              />
              <button
                onClick={(e) => habilitado && onSelectField(def.key, getClickMode(e))}
                disabled={!habilitado}
                className={"flex-1 text-left text-xs font-medium " + (habilitado ? "" : "opacity-40")}
              >
                {def.label}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="text-xs text-slate-500">Campo que cresce em altura</label>
        <select
          value={alturaCresceCom ?? ""}
          onChange={(e) => onChangeAlturaCresceCom((e.target.value || null) as CardFieldKey | null)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Nenhum</option>
          {camposTexto.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={gutterMode} onChange={(e) => onToggleGutterMode(e.target.checked)} />
          Definir espaçamento (gutter)
        </label>
        {gutterMode && (
          <p className="mt-1 text-[11px] text-slate-400">
            Arraste a cópia semitransparente pra onde o próximo card da grade deve ficar.
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          Atual: {gutterX !== null ? `${gutterX}px` : "—"} × {gutterY !== null ? `${gutterY}px` : "—"}
        </p>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={borda.ativa} onChange={(e) => onUpdateBorda({ ativa: e.target.checked })} />
          Contorno do card na grade
        </label>
        {borda.ativa && (
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500">Cor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={borda.cor}
                  onChange={(e) => onUpdateBorda({ cor: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-slate-300"
                />
                <input
                  key={borda.cor}
                  defaultValue={borda.cor}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onUpdateBorda({ cor: v });
                  }}
                  className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center justify-between text-xs text-slate-500">
                <span>Transparência</span>
                <span>{Math.round(borda.opacidade * 100)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(borda.opacidade * 100)}
                onChange={(e) => onUpdateBorda({ opacidade: Number(e.target.value) / 100 })}
                className="mt-1 w-full"
              />
            </div>
            <NumberField
              label="Espessura"
              value={borda.espessura}
              onCommit={(v) => onUpdateBorda({ espessura: Math.max(0.5, v) })}
            />
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Formas</p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {CARD_SHAPE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => onAddShape(t.value)}
              className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              + {t.label}
            </button>
          ))}
        </div>
        {shapes.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {shapes.map((shape, i) => {
              const def = CARD_SHAPE_TYPES.find((t) => t.value === shape.type);
              return (
                <button
                  key={shape.id}
                  onClick={(e) => onSelectShape(shape.id, getClickMode(e))}
                  className={
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium " +
                    (selectedShapeIds.includes(shape.id) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700")
                  }
                >
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-400" style={{ backgroundColor: shape.color }} />
                  {def?.label ?? shape.type} {i + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        {selectionCount === 0 && (
          <p className="text-xs text-slate-400">Clique num campo ou forma (na lista acima ou no canvas) pra editar.</p>
        )}

        {selectionCount > 1 && (
          <p className="text-xs text-slate-500">
            {selectionCount} elementos selecionados. Use as setas do teclado pra mover todos juntos (Shift+seta move 10px).
          </p>
        )}

        {selectionCount === 1 && selectedShape && (
          <ShapeProperties shape={selectedShape} onUpdate={(patch) => onUpdateShape(selectedShape.id, patch)} onRemove={() => onRemoveShape(selectedShape.id)} />
        )}

        {selectionCount === 1 && selectedDef && selectedDef.type === "image" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-slate-900">{selectedDef.label}</p>
            <NumberField
              label="Posição X"
              value={(layout[selectedDef.key] as CardImageElementConfig).x}
              onCommit={(v) => onUpdateField(selectedDef.key, { x: v })}
            />
            <NumberField
              label="Posição Y"
              value={(layout[selectedDef.key] as CardImageElementConfig).y}
              onCommit={(v) => onUpdateField(selectedDef.key, { y: v })}
            />
            <NumberField
              label="Largura"
              value={(layout[selectedDef.key] as CardImageElementConfig).w}
              onCommit={(v) => onUpdateField(selectedDef.key, { w: Math.max(20, v) })}
            />
            <NumberField
              label="Altura"
              value={(layout[selectedDef.key] as CardImageElementConfig).h}
              onCommit={(v) => onUpdateField(selectedDef.key, { h: Math.max(20, v) })}
            />
          </div>
        )}

        {selectionCount === 1 && selectedDef && selectedDef.type === "text" && (
          <TextProperties
            label={selectedDef.label}
            cfg={layout[selectedDef.key] as CardTextElementConfig}
            onUpdate={(patch) => onUpdateField(selectedDef.key, patch)}
          />
        )}
      </div>
    </div>
  );
}

function ShapeProperties({
  shape,
  onUpdate,
  onRemove,
}: {
  shape: CardShape;
  onUpdate: (patch: Partial<CardShape>) => void;
  onRemove: () => void;
}) {
  const label = CARD_SHAPE_TYPES.find((t) => t.value === shape.type)?.label ?? shape.type;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <button onClick={onRemove} className="text-xs font-medium text-red-600 hover:text-red-800">
          Excluir
        </button>
      </div>

      <NumberField label="Posição X" value={shape.x} onCommit={(v) => onUpdate({ x: v })} />
      <NumberField label="Posição Y" value={shape.y} onCommit={(v) => onUpdate({ y: v })} />
      <NumberField label="Largura" value={shape.w} onCommit={(v) => onUpdate({ w: Math.max(4, v) })} />
      <NumberField label="Altura" value={shape.h} onCommit={(v) => onUpdate({ h: Math.max(4, v) })} />

      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-500">Cor</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={shape.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-slate-300"
          />
          <input
            key={shape.color}
            defaultValue={shape.color}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onUpdate({ color: v });
            }}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center justify-between text-xs text-slate-500">
          <span>Transparência</span>
          <span>{Math.round(shape.opacity * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(shape.opacity * 100)}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
          className="mt-1 w-full"
        />
      </div>
    </div>
  );
}

function TextProperties({
  label,
  cfg,
  onUpdate,
}: {
  label: string;
  cfg: CardTextElementConfig;
  onUpdate: (patch: Partial<CardTextElementConfig>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-slate-900">{label}</p>

      <div>
        <label className="text-xs text-slate-500">Texto</label>
        <input
          key={cfg.text}
          defaultValue={cfg.text}
          onBlur={(e) => onUpdate({ text: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          O valor real do produto entra em <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">{"{valor}"}</code> — pode
          adicionar um rótulo fixo em volta, ex.: <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">À vista: {"{valor}"}</code>.
        </p>
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
    </div>
  );
}
