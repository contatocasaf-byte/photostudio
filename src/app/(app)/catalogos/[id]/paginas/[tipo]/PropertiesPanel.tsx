"use client";

import { useState } from "react";
import {
  PAGE_FIELD_DEFS,
  PAGE_SIZE_PRESETS,
  mmToPx,
  presetToPx,
  pxToMm,
  type Margens,
  type PageFieldKey,
  type PageImageElementConfig,
  type PageLayout,
  type PageTextElementConfig,
} from "../../../core/pageConfig";
import { getPageAssetUploadUrl } from "../../../paginas/actions";
import { getPublicUrl } from "@/lib/storage/public-url";
import type { TextAlign } from "@/lib/canvasText";
import FilePickerZone from "@/components/FilePickerZone";

type Props = {
  layout: PageLayout;
  elementosHabilitados: PageFieldKey[];
  onToggleElemento: (key: PageFieldKey, habilitado: boolean) => void;
  selectedKey: PageFieldKey | null;
  onSelectKey: (key: PageFieldKey | null) => void;
  onUpdateField: (key: PageFieldKey, patch: Partial<PageImageElementConfig & PageTextElementConfig>) => void;
  largura: number;
  altura: number;
  onResizeBoundary: (patch: { largura: number; altura: number }) => void;
  margens: Margens;
  onChangeMargens: (patch: Partial<Margens>) => void;
  fundoUrl: string | null;
  onChangeFundo: (patch: { key: string | null; url: string | null }) => void;
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
  elementosHabilitados,
  onToggleElemento,
  selectedKey,
  onSelectKey,
  onUpdateField,
  largura,
  altura,
  onResizeBoundary,
  margens,
  onChangeMargens,
  fundoUrl,
  onChangeFundo,
}: Props) {
  const selectedDef = selectedKey ? PAGE_FIELD_DEFS.find((d) => d.key === selectedKey) : null;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<"px" | "mm">("px");
  const [fundoExpanded, setFundoExpanded] = useState(true);
  const [campoExpanded, setCampoExpanded] = useState(true);

  function toDisplay(px: number) {
    return unit === "mm" ? pxToMm(px) : Math.round(px);
  }
  function fromDisplay(v: number) {
    return unit === "mm" ? mmToPx(v) : Math.round(v);
  }

  async function uploadAsset(file: File): Promise<{ key: string; url: string }> {
    const { url: uploadUrl, key, error } = await getPageAssetUploadUrl({ fileName: file.name, contentType: file.type });
    if (error || !uploadUrl || !key) throw new Error(error ?? "Falha ao gerar URL de upload.");

    const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) throw new Error("Falha no upload pro R2.");

    return { key, url: getPublicUrl(key) };
  }

  async function handleUploadFundo(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { key, url } = await uploadAsset(file);
      onChangeFundo({ key, url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadImage(fileList: FileList) {
    if (!selectedKey) return;
    const file = fileList[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { key, url } = await uploadAsset(file);
      onUpdateField(selectedKey, { key, url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="w-72 shrink-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tamanho da página</p>
      <p className="mt-1 text-[11px] text-slate-400">Vale pra todos os modelos deste catálogo.</p>
      <div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 p-2">
        <select
          value={
            PAGE_SIZE_PRESETS.find((p) => {
              const px = presetToPx(p);
              return px.largura === Math.round(largura) && px.altura === Math.round(altura);
            })?.key ?? ""
          }
          onChange={(e) => {
            const preset = PAGE_SIZE_PRESETS.find((p) => p.key === e.target.value);
            if (preset) onResizeBoundary(presetToPx(preset));
          }}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
        >
          <option value="">Personalizado</option>
          {(["Papel", "Redes sociais"] as const).map((group) => (
            <optgroup key={group} label={group}>
              {PAGE_SIZE_PRESETS.filter((p) => p.group === group).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-500">Unidade</label>
          <div className="flex gap-1">
            {(["px", "mm"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={
                  "rounded-md px-2 py-1 text-xs font-medium " +
                  (unit === u ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                }
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <NumberField
          label={`Largura (${unit})`}
          value={toDisplay(largura)}
          onCommit={(v) => onResizeBoundary({ largura: Math.max(fromDisplay(v), 200), altura })}
        />
        <NumberField
          label={`Altura (${unit})`}
          value={toDisplay(altura)}
          onCommit={(v) => onResizeBoundary({ largura, altura: Math.max(fromDisplay(v), 200) })}
        />
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Margens</p>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2">
        <NumberField label="Topo" value={margens.top} onCommit={(v) => onChangeMargens({ top: Math.max(0, v) })} />
        <NumberField label="Base" value={margens.bottom} onCommit={(v) => onChangeMargens({ bottom: Math.max(0, v) })} />
        <NumberField label="Esquerda" value={margens.left} onCommit={(v) => onChangeMargens({ left: Math.max(0, v) })} />
        <NumberField label="Direita" value={margens.right} onCommit={(v) => onChangeMargens({ right: Math.max(0, v) })} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plano de fundo</p>
        <button
          onClick={() => setFundoExpanded((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-700"
        >
          {fundoExpanded ? "Reduzir" : "Expandir"}
        </button>
      </div>
      {fundoExpanded && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 p-2">
          {fundoUrl && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fundoUrl} alt="Plano de fundo" className="h-14 w-14 rounded border border-slate-200 object-cover" />
              <button
                onClick={() => onChangeFundo({ key: null, url: null })}
                className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Remover
              </button>
            </div>
          )}
          <FilePickerZone
            disabled={uploading}
            title="Arraste uma imagem aqui ou clique para escolher"
            subtitle="Cobre a página inteira, atrás dos elementos"
            buttonLabel={uploading ? "Enviando..." : fundoUrl ? "Trocar arquivo" : "Escolher arquivo"}
            onFiles={handleUploadFundo}
          />
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      )}

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Elementos</p>
      <div className="mt-2 flex flex-col gap-1">
        {PAGE_FIELD_DEFS.map((def) => {
          const habilitado = elementosHabilitados.includes(def.key);
          return (
            <div
              key={def.key}
              className={
                "flex items-center gap-2 rounded-md px-2 py-1.5 " +
                (selectedKey === def.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700")
              }
            >
              <input
                type="checkbox"
                checked={habilitado}
                onChange={(e) => onToggleElemento(def.key, e.target.checked)}
                className="shrink-0"
              />
              <button
                onClick={() => habilitado && onSelectKey(def.key)}
                disabled={!habilitado}
                className={"flex-1 text-left text-xs font-medium " + (habilitado ? "" : "opacity-40")}
              >
                {def.label}
              </button>
              <span className="shrink-0 text-[10px] uppercase text-slate-400">{def.zone === "header" ? "topo" : "rodapé"}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        {!selectedDef && <p className="text-xs text-slate-400">Clique num elemento habilitado (na lista acima ou no canvas) pra editar.</p>}

        {selectedDef && (
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">{selectedDef.label}</p>
            <button onClick={() => setCampoExpanded((v) => !v)} className="text-xs text-slate-400 hover:text-slate-700">
              {campoExpanded ? "Reduzir" : "Expandir"}
            </button>
          </div>
        )}

        {selectedDef && campoExpanded && selectedDef.type === "image" && (
          <div className="mt-2 flex flex-col gap-2">
            <FilePickerZone
              disabled={uploading}
              title="Arraste uma imagem aqui ou clique para escolher"
              subtitle="Substitui o arquivo atual deste elemento"
              buttonLabel={uploading ? "Enviando..." : "Escolher arquivo"}
              onFiles={handleUploadImage}
            />
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
            <NumberField
              label="Posição X"
              value={(layout[selectedDef.key] as PageImageElementConfig).x}
              onCommit={(v) => onUpdateField(selectedDef.key, { x: v })}
            />
            <NumberField
              label="Posição Y"
              value={(layout[selectedDef.key] as PageImageElementConfig).y}
              onCommit={(v) => onUpdateField(selectedDef.key, { y: v })}
            />
            <NumberField
              label="Largura"
              value={(layout[selectedDef.key] as PageImageElementConfig).w}
              onCommit={(v) => onUpdateField(selectedDef.key, { w: Math.max(20, v) })}
            />
            <NumberField
              label="Altura"
              value={(layout[selectedDef.key] as PageImageElementConfig).h}
              onCommit={(v) => onUpdateField(selectedDef.key, { h: Math.max(20, v) })}
            />
          </div>
        )}

        {selectedDef && campoExpanded && selectedDef.type === "text" && (
          <div className="mt-2">
            <TextProperties
              cfg={layout[selectedDef.key] as PageTextElementConfig}
              onUpdate={(patch) => onUpdateField(selectedDef.key, patch)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TextProperties({
  cfg,
  onUpdate,
}: {
  cfg: PageTextElementConfig;
  onUpdate: (patch: Partial<PageTextElementConfig>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
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
