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
import { getSection, getCatalog } from "../../../../actions";
import {
  listPlanilhaProdutos,
  listSectionItems,
  addProductToSection,
  removeSectionItem,
  reorderSectionItems,
  type ProductRow,
  type SectionItem,
} from "../../../../produtos/actions";

function formatPreco(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ItemRow({ item, onRemove }: { item: SectionItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
    >
      <button {...attributes} {...listeners} className="cursor-grab px-1 text-slate-300 hover:text-slate-600" title="Arrastar">
        ⠿
      </button>
      <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{item.product.codigo}</span>
      <span className="w-28 shrink-0 truncate text-xs text-slate-500">{item.product.ref || "—"}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{item.product.descricao || "—"}</span>
      <span className="shrink-0 text-xs text-slate-400">
        {formatPreco(item.product.preco1)} / {formatPreco(item.product.preco2)}
      </span>
      <button
        onClick={onRemove}
        className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
      >
        Remover
      </button>
    </div>
  );
}

export default function SectionProdutosPage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { id: catalogId, sectionId } = use(params);

  const [sectionTitulo, setSectionTitulo] = useState<string | null>(null);
  const [planilhaId, setPlanilhaId] = useState<string | null>(null);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<ProductRow[]>([]);
  const [items, setItems] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function refreshItems() {
    const res = await listSectionItems(sectionId);
    if (res.error) setError(res.error);
    else setItems(res.items ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSection(sectionId), getCatalog(catalogId), listSectionItems(sectionId)]).then(
      ([sectionRes, catalogRes, itemsRes]) => {
        if (cancelled) return;
        if (sectionRes.error) setError(sectionRes.error);
        else setSectionTitulo(sectionRes.section?.titulo ?? null);

        if (catalogRes.error) setError(catalogRes.error);
        else setPlanilhaId(catalogRes.catalog?.planilhaId ?? null);

        if (itemsRes.error) setError(itemsRes.error);
        else setItems(itemsRes.items ?? []);

        setLoading(false);

        const planilha = catalogRes.catalog?.planilhaId;
        if (planilha) {
          listPlanilhaProdutos(planilha).then((prodRes) => {
            if (cancelled) return;
            if (prodRes.error) setError(prodRes.error);
            else setProdutosDisponiveis(prodRes.produtos ?? []);
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [catalogId, sectionId]);

  const jaAdicionados = new Set(items.map((i) => i.product.id));
  const q = query.trim().toLowerCase();
  const resultados = q
    ? produtosDisponiveis.filter(
        (p) =>
          p.codigo.toLowerCase().includes(q) ||
          (p.ref ?? "").toLowerCase().includes(q) ||
          (p.descricao ?? "").toLowerCase().includes(q)
      )
    : [];

  async function handleAdd(productId: string) {
    setError(null);
    const res = await addProductToSection(sectionId, productId);
    if (res.error) {
      setError(res.error);
      return;
    }
    await refreshItems();
  }

  async function handleRemove(itemId: string) {
    setError(null);
    const res = await removeSectionItem(itemId);
    if (res.error) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);
    const res = await reorderSectionItems(reordered.map((i) => i.id));
    if (res.error) setError(res.error);
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando produtos...</p>;

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {sectionTitulo ?? "Voltar"}
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Produtos — {sectionTitulo}</h1>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!planilhaId ? (
        <p className="mt-4 text-sm text-slate-500">
          Este catálogo ainda não tem uma planilha de produtos selecionada.{" "}
          <Link href={`/catalogos/${catalogId}`} className="underline">
            Escolher planilha
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Adicionar produto</p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código, referência ou descrição..."
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {q && (
              <div className="mt-2 flex flex-col gap-1">
                {resultados.length === 0 && <p className="text-xs text-slate-400">Nenhum produto encontrado.</p>}
                {resultados.slice(0, 20).map((p) => {
                  const adicionado = jaAdicionados.has(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{p.codigo}</span>
                      <span className="w-28 shrink-0 truncate text-xs text-slate-500">{p.ref || "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-900">{p.descricao || "—"}</span>
                      <button
                        onClick={() => handleAdd(p.id)}
                        disabled={adicionado}
                        className="shrink-0 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        {adicionado ? "Adicionado" : "+ Adicionar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Produtos desta seção ({items.length})
            </p>
            {items.length === 0 && <p className="mt-2 text-sm text-slate-400">Nenhum produto adicionado ainda.</p>}
            {items.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="mt-2 flex flex-col gap-2">
                    {items.map((item) => (
                      <ItemRow key={item.id} item={item} onRemove={() => handleRemove(item.id)} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </>
      )}
    </div>
  );
}
