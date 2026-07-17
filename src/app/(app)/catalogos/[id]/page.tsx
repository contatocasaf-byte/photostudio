"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
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
import {
  getCatalog,
  renameCatalog,
  listSections,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  type Section,
} from "../actions";

function SectionForm({
  initial,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  initial: { numero: string; titulo: string; colunas: number };
  onCancel?: () => void;
  onSubmit: (values: { numero: string; titulo: string; colunas: number }) => Promise<void>;
  submitLabel: string;
}) {
  const [numero, setNumero] = useState(initial.numero);
  const [titulo, setTitulo] = useState(initial.titulo);
  const [colunas, setColunas] = useState(initial.colunas);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ numero, titulo, colunas });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        placeholder="Nº"
        className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título da seção"
        className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        Colunas
        <input
          type="number"
          min={1}
          max={12}
          value={colunas}
          onChange={(e) => setColunas(Math.max(1, Number(e.target.value) || 1))}
          className="w-14 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <button
        onClick={handleSubmit}
        disabled={saving || !titulo.trim()}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Salvando..." : submitLabel}
      </button>
      {onCancel && (
        <button onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      )}
    </div>
  );
}

function SectionRow({
  catalogId,
  section,
  onSave,
  onDelete,
}: {
  catalogId: string;
  section: Section;
  onSave: (values: { numero: string; titulo: string; colunas: number }) => Promise<void>;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const [editing, setEditing] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-md border border-slate-200 bg-white px-3 py-2.5"
    >
      {editing ? (
        <SectionForm
          initial={{ numero: section.numero ?? "", titulo: section.titulo, colunas: section.colunas }}
          submitLabel="Salvar"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await onSave(values);
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab px-1 text-slate-300 hover:text-slate-600" title="Arrastar">
            ⠿
          </button>
          <span className="w-8 shrink-0 text-xs font-semibold text-slate-400">{section.numero || "—"}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{section.titulo}</span>
          <span className="shrink-0 text-xs text-slate-400">{section.colunas} colunas</span>
          <Link
            href={`/catalogos/${catalogId}/secoes/${section.id}`}
            className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Editar card
          </Link>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}

export default function CatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [catalogNome, setCatalogNome] = useState<string | null>(null);
  const [editingNome, setEditingNome] = useState(false);
  const [nomeDraft, setNomeDraft] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCatalog(id), listSections(id)]).then(([catalogRes, sectionsRes]) => {
      if (cancelled) return;
      if (catalogRes.error) setError(catalogRes.error);
      else setCatalogNome(catalogRes.catalog?.nome ?? "");
      if (sectionsRes.error) setError(sectionsRes.error);
      else setSections(sectionsRes.sections ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSaveNome() {
    if (!nomeDraft.trim()) return;
    const res = await renameCatalog(id, nomeDraft);
    if (res.error) setError(res.error);
    else setCatalogNome(nomeDraft.trim());
    setEditingNome(false);
  }

  async function handleCreateSection(values: { numero: string; titulo: string; colunas: number }) {
    const res = await createSection({ catalogId: id, ...values });
    if (res.error) {
      setError(res.error);
      return;
    }
    const refreshed = await listSections(id);
    if (refreshed.sections) setSections(refreshed.sections);
    setShowNewForm(false);
  }

  async function handleSaveSection(sectionId: string, values: { numero: string; titulo: string; colunas: number }) {
    const res = await updateSection(sectionId, values);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...values, numero: values.numero || null } : s)));
  }

  async function handleDeleteSection(section: Section) {
    if (!confirm(`Excluir a seção "${section.titulo}"?`)) return;
    const res = await deleteSection(section.id);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSections((prev) => prev.filter((s) => s.id !== section.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sections, oldIndex, newIndex);
    setSections(reordered);
    const res = await reorderSections(reordered.map((s) => s.id));
    if (res.error) setError(res.error);
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando catálogo...</p>;

  return (
    <div>
      <Link href="/catalogos" className="text-xs text-slate-500 hover:text-slate-700">
        ← Catálogos
      </Link>

      <div className="mt-2">
        {editingNome ? (
          <div className="flex items-center gap-2">
            <input
              value={nomeDraft}
              onChange={(e) => setNomeDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveNome()}
              autoFocus
              className="rounded-md border border-slate-300 px-2 py-1.5 text-lg font-semibold"
            />
            <button onClick={handleSaveNome} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
              Salvar
            </button>
            <button onClick={() => setEditingNome(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        ) : (
          <h1
            className="cursor-pointer text-lg font-semibold text-slate-900 hover:underline"
            title="Clique para renomear"
            onClick={() => {
              setNomeDraft(catalogNome ?? "");
              setEditingNome(true);
            }}
          >
            {catalogNome}
          </h1>
        )}
      </div>

      <Link
        href={`/catalogos/${id}/paginas`}
        className="mt-1 inline-block text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
      >
        Modelos de página (capa, abertura de seção, continuação)
      </Link>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Seções</p>
        {!showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Nova seção
          </button>
        )}
      </div>

      {showNewForm && (
        <div className="mt-2 rounded-md border border-dashed border-slate-300 p-3">
          <SectionForm
            initial={{ numero: "", titulo: "", colunas: 3 }}
            submitLabel="Criar seção"
            onCancel={() => setShowNewForm(false)}
            onSubmit={handleCreateSection}
          />
        </div>
      )}

      {sections.length === 0 && !showNewForm && (
        <p className="mt-4 text-sm text-slate-400">Nenhuma seção ainda — crie a primeira acima.</p>
      )}

      {sections.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="mt-3 flex flex-col gap-2">
              {sections.map((s) => (
                <SectionRow
                  key={s.id}
                  catalogId={id}
                  section={s}
                  onSave={(values) => handleSaveSection(s.id, values)}
                  onDelete={() => handleDeleteSection(s)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
