"use client";

import FilePickerZone from "@/components/FilePickerZone";
import PhotoAdjustWidget, { type PhotoTransform } from "../PhotoAdjustWidget";
import { currentFotoUrl, type BatchItem } from "./types";

const DEFAULT_TRANSFORM: PhotoTransform = { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 };

type Props = {
  item: BatchItem;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  boxW: number;
  boxH: number;
  onUpdate: (patch: Partial<BatchItem>) => void;
  onDownload: () => void;
};

export default function BatchItemRow({ item, index, expanded, onToggleExpand, boxW, boxH, onUpdate, onDownload }: Props) {
  const fotoUrl = currentFotoUrl(item);

  function handleTrocarFoto(files: FileList) {
    const file = files[0];
    if (!file) return;
    onUpdate({
      fotoManualUrl: URL.createObjectURL(file),
      fotoManualName: file.name,
      transform: DEFAULT_TRANSFORM,
    });
  }

  function handleUsarAutomatica() {
    onUpdate({ fotoManualUrl: null, fotoManualName: null, transform: DEFAULT_TRANSFORM });
  }

  return (
    <div className={"rounded-lg border " + (item.included ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-60")}>
      <div className="flex items-center gap-3 px-3 py-2">
        <input type="checkbox" checked={item.included} onChange={(e) => onUpdate({ included: e.target.checked })} />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotoUrl ?? undefined}
          alt=""
          className="h-10 w-10 shrink-0 rounded border border-slate-200 bg-slate-100 object-contain"
          style={{ visibility: fotoUrl ? "visible" : "hidden" }}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">
            #{index + 1} • {item.codigo} {item.ref && `— ${item.ref}`}
          </p>
          <p className="truncate text-xs text-slate-400">{item.desc || "Sem descrição"}</p>
        </div>

        {!fotoUrl && <span className="shrink-0 text-xs font-medium text-amber-600">Sem foto</span>}
        {item.status === "pronto" && (
          <>
            <span className="shrink-0 text-xs font-medium text-emerald-700">✔ Gerada</span>
            <button onClick={onDownload} className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
              Baixar
            </button>
          </>
        )}
        {item.status === "erro" && <span className="shrink-0 text-xs font-medium text-red-600" title={item.error}>✖ Erro</span>}
        {item.status === "gerando" && <span className="shrink-0 text-xs font-medium text-slate-500">Gerando...</span>}

        <button
          onClick={onToggleExpand}
          className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          {expanded ? "Fechar" : "Ajustar"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600">Referência</label>
              <input
                value={item.ref}
                onChange={(e) => onUpdate({ ref: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Descrição</label>
              <input
                value={item.desc}
                onChange={(e) => onUpdate({ desc: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Preço SP (R$)</label>
              <input
                value={item.precoSp}
                onChange={(e) => onUpdate({ precoSp: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Preço PA (R$)</label>
              <input
                value={item.precoPa}
                onChange={(e) => onUpdate({ precoPa: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="w-48">
              <FilePickerZone
                title="Trocar foto"
                subtitle="Substitui a automática"
                buttonLabel="Escolher arquivo"
                onFiles={handleTrocarFoto}
              />
            </div>
            {item.fotoManualUrl && (
              <div className="text-xs text-slate-500">
                <p className="text-sky-700">Foto manual: {item.fotoManualName}</p>
                <button onClick={handleUsarAutomatica} className="mt-1 text-red-600 hover:underline">
                  ✖ Usar automática
                </button>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs font-medium text-slate-600">Ajustar enquadramento da foto:</p>
          <div className="mt-2">
            <PhotoAdjustWidget
              photoUrl={fotoUrl}
              boxW={boxW}
              boxH={boxH}
              transform={item.transform}
              onChange={(t) => onUpdate({ transform: t })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
