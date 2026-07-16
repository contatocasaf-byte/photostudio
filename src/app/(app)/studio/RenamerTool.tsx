"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { downloadBlob, zipBlobs, uniqueName } from "./download";
import FilePickerZone from "@/components/FilePickerZone";
import InfoTooltip from "@/components/InfoTooltip";

type FileEntry = {
  id: string;
  kind: "file";
  file: File;
  previewUrl: string;
  ignorar: boolean;
};
type GroupEntry = {
  id: string;
  kind: "group";
  codigo: string;
};
type RenameEntry = FileEntry | GroupEntry;

function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot) : "";
}

function newId() {
  return Math.random().toString(36).slice(2);
}

// Porta a mecânica de Renomeador/_calcular_nomes (removedor_fundo.py) —
// sem OCR: o usuário marca manualmente qual foto é a etiqueta de cada
// grupo e digita o código. Percorre a lista na ordem, cada GroupEntry
// abre um grupo novo (reseta o contador); cada FileEntry não-ignorado
// dentro de um grupo vira "{codigo}_{contador}{ext}". A própria foto da
// etiqueta e arquivos sem grupo ainda aberto ficam sem nome novo (não
// entram no zip).
function computeNames(entries: RenameEntry[]) {
  let currentCode: string | null = null;
  let counter = 0;
  const usedNames = new Set<string>();
  const result = new Map<string, string | null>();
  for (const entry of entries) {
    if (entry.kind === "group") {
      currentCode = entry.codigo.trim() || null;
      counter = 0;
      continue;
    }
    if (entry.ignorar || !currentCode) {
      result.set(entry.id, null);
      continue;
    }
    counter += 1;
    const name = uniqueName(usedNames, `${currentCode}_${counter}${extensionOf(entry.file.name)}`);
    result.set(entry.id, name);
  }
  return result;
}

function GroupRow({
  entry,
  onCodigoChange,
  onRemove,
}: {
  entry: GroupEntry;
  onCodigoChange: (value: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-white"
    >
      <button {...attributes} {...listeners} className="cursor-grab px-1 text-slate-400 hover:text-white" title="Arrastar">
        ⠿
      </button>
      <span className="shrink-0 text-xs font-semibold tracking-wide text-slate-300">GRUPO</span>
      <input
        value={entry.codigo}
        onChange={(e) => onCodigoChange(e.target.value)}
        placeholder="Código do produto"
        className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white placeholder:text-slate-500"
      />
      <button onClick={onRemove} className="shrink-0 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">
        Remover
      </button>
    </div>
  );
}

function FileRow({
  entry,
  newName,
  onMarkEtiqueta,
  onToggleIgnorar,
  onDownload,
  onRemove,
}: {
  entry: FileEntry;
  newName: string | null;
  onMarkEtiqueta: () => void;
  onToggleIgnorar: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={
        "flex items-center gap-2 rounded-md border px-2 py-2 " +
        (entry.ignorar ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white")
      }
    >
      <button {...attributes} {...listeners} className="cursor-grab px-1 text-slate-300 hover:text-slate-600" title="Arrastar">
        ⠿
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={entry.previewUrl} alt={entry.file.name} className="h-12 w-12 shrink-0 rounded border border-slate-200 object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-slate-600" title={entry.file.name}>
          {entry.file.name}
        </p>
        {entry.ignorar ? (
          <p className="text-xs font-medium text-amber-600">Ignorado (etiqueta/excluído)</p>
        ) : newName ? (
          <p className="truncate text-xs font-medium text-emerald-700">→ {newName}</p>
        ) : (
          <p className="text-xs text-slate-400">Sem grupo ainda</p>
        )}
      </div>
      <button
        onClick={onMarkEtiqueta}
        className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        Marcar como etiqueta
      </button>
      <button
        onClick={onToggleIgnorar}
        className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        {entry.ignorar ? "Incluir" : "Ignorar"}
      </button>
      {newName && (
        <button
          onClick={onDownload}
          className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Baixar
        </button>
      )}
      <button onClick={onRemove} className="shrink-0 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100">
        Remover
      </button>
    </div>
  );
}

export default function RenamerTool() {
  const [entries, setEntries] = useState<RenameEntry[]>([]);
  const [zipping, setZipping] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const newNames = useMemo(() => computeNames(entries), [entries]);

  function handleSelectFiles(fileList: FileList) {
    const novos: FileEntry[] = Array.from(fileList).map((file) => ({
      id: newId(),
      kind: "file",
      file,
      previewUrl: URL.createObjectURL(file),
      ignorar: false,
    }));
    setEntries((prev) => [...prev, ...novos]);
  }

  function markEtiqueta(fileId: string) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === fileId);
      if (idx === -1) return prev;
      const group: GroupEntry = { id: newId(), kind: "group", codigo: "" };
      const next = [...prev];
      next.splice(idx, 0, group);
      return next.map((e) => (e.id === fileId && e.kind === "file" ? { ...e, ignorar: true } : e));
    });
  }

  function addManualGroup() {
    setEntries((prev) => [...prev, { id: newId(), kind: "group", codigo: "" }]);
  }

  function setCodigo(groupId: string, value: string) {
    setEntries((prev) => prev.map((e) => (e.id === groupId && e.kind === "group" ? { ...e, codigo: value } : e)));
  }

  function toggleIgnorar(fileId: string) {
    setEntries((prev) => prev.map((e) => (e.id === fileId && e.kind === "file" ? { ...e, ignorar: !e.ignorar } : e)));
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function limparLista() {
    setEntries([]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEntries((prev) => {
      const oldIndex = prev.findIndex((e) => e.id === active.id);
      const newIndex = prev.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function handleDownloadZip() {
    const zipItems = entries
      .filter((e): e is FileEntry => e.kind === "file")
      .map((e) => ({ file: e, name: newNames.get(e.id) }))
      .filter((x): x is { file: FileEntry; name: string } => !!x.name)
      .map(({ file, name }) => ({ blob: file.file, filename: name }));
    if (zipItems.length === 0) return;
    setZipping(true);
    try {
      await zipBlobs(zipItems, `fotos-renomeadas-${Date.now()}.zip`);
    } finally {
      setZipping(false);
    }
  }

  function handleDownloadOne(entry: FileEntry) {
    const name = newNames.get(entry.id);
    if (!name) return;
    downloadBlob(entry.file, name);
  }

  const totalFiles = entries.filter((e) => e.kind === "file").length;
  const renomeaveis = [...newNames.values()].filter((v) => v !== null).length;
  const semGrupo = entries.filter((e) => e.kind === "file" && !e.ignorar && !newNames.get(e.id)).length;

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
      <div className="flex items-start gap-2">
        <p className="text-sm text-slate-500">
          Envie as fotos na ordem em que foram tiradas (etiqueta do produto seguida das fotos do produto). Marque a
          foto da etiqueta, digite o código e as fotos seguintes do mesmo grupo recebem <code>código_1</code>,{" "}
          <code>código_2</code>... automaticamente, até a próxima etiqueta.
        </p>
        <InfoTooltip title="Como funciona o Renomeador">
          <p>Sem OCR — a marcação de qual foto é etiqueta e qual é o código é manual.</p>
          <p>
            <strong>1.</strong> Envie as fotos na ordem em que foram tiradas: normalmente uma foto da etiqueta do
            produto, seguida das fotos daquele produto, depois a etiqueta do próximo, e assim por diante.
          </p>
          <p>
            <strong>2.</strong> Clique em &quot;Marcar como etiqueta&quot; na foto da etiqueta — isso insere uma
            barra de grupo antes dela, com um campo pra digitar o código. A própria foto da etiqueta fica marcada
            como ignorada (ela não é uma foto de produto).
          </p>
          <p>
            <strong>3.</strong> As fotos seguintes daquele grupo recebem <code>código_1</code>, <code>código_2</code>
            ... automaticamente, até o próximo grupo.
          </p>
          <p>
            Dá pra arrastar (ícone ⠿) pra reordenar, alternar &quot;Ignorar/Incluir&quot; em qualquer foto, remover
            itens, ou criar um &quot;Grupo manual&quot; sem foto de etiqueta associada.
          </p>
          <p>
            &quot;Renomear&quot; na prática baixa os arquivos com o nome novo (individual ou .zip) — o navegador não
            consegue renomear arquivos no disco do computador.
          </p>
        </InfoTooltip>
      </div>

      <div className="mt-4">
        <FilePickerZone
          multiple
          title="Arraste as fotos aqui ou clique para escolher"
          subtitle="Etiquetas e fotos de produto, na ordem"
          buttonLabel="Escolher arquivos"
          onFiles={handleSelectFiles}
        />
      </div>

      {entries.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              {totalFiles} foto{totalFiles !== 1 ? "s" : ""} — {renomeaveis} será{renomeaveis !== 1 ? "ão" : ""}{" "}
              renomeada{renomeaveis !== 1 ? "s" : ""}
              {semGrupo > 0 && `, ${semGrupo} sem grupo`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={addManualGroup}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                + Grupo manual
              </button>
              <button
                onClick={limparLista}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Limpar lista
              </button>
              <button
                onClick={handleDownloadZip}
                disabled={zipping || renomeaveis === 0}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {zipping ? "Compactando..." : "Baixar renomeados (.zip)"}
              </button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <div className="mt-4 flex flex-col gap-2">
                {entries.map((entry) =>
                  entry.kind === "group" ? (
                    <GroupRow
                      key={entry.id}
                      entry={entry}
                      onCodigoChange={(v) => setCodigo(entry.id, v)}
                      onRemove={() => removeEntry(entry.id)}
                    />
                  ) : (
                    <FileRow
                      key={entry.id}
                      entry={entry}
                      newName={newNames.get(entry.id) ?? null}
                      onMarkEtiqueta={() => markEtiqueta(entry.id)}
                      onToggleIgnorar={() => toggleIgnorar(entry.id)}
                      onDownload={() => handleDownloadOne(entry)}
                      onRemove={() => removeEntry(entry.id)}
                    />
                  )
                )}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
