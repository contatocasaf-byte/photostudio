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
  sectionTemDestaqueTemplate,
  setItemDestaque,
  type ProductRow,
  type SectionItem,
} from "../../../../produtos/actions";
import type { CatalogTipo } from "../../../../core/permissoes";
import { ordenarItensSecao, type ColunaOrdenacao, type DirecaoOrdenacao } from "../../../../core/ordenarItensSecao";

function formatPreco(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ItemRow({ item, onRemove, onToggleDestaque }: { item: SectionItem; onRemove: () => void; onToggleDestaque: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={
        "flex items-center gap-2 rounded-md border px-3 py-2 " + (item.destaque ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")
      }
    >
      <button {...attributes} {...listeners} className="cursor-grab px-1 text-slate-300 hover:text-slate-600" title="Arrastar">
        ⠿
      </button>
      <button
        onClick={onToggleDestaque}
        title={item.destaque ? "Em destaque (linha própria, card de destaque) — clique para tirar" : "Marcar como produto em destaque"}
        aria-label={item.destaque ? "Remover destaque" : "Marcar como destaque"}
        className={"shrink-0 px-0.5 text-base leading-none " + (item.destaque ? "text-amber-500" : "text-slate-300 hover:text-amber-500")}
      >
        {item.destaque ? "★" : "☆"}
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

// Cabeçalho da lista (só no Jornal de Ofertas): clicar numa coluna ordena
// os produtos por ela; clicar de novo inverte. Alinhado às colunas de ItemRow.
function CabecalhoOrdenacao({
  ordenacao,
  onOrdenar,
}: {
  ordenacao: { coluna: ColunaOrdenacao; direcao: DirecaoOrdenacao } | null;
  onOrdenar: (coluna: ColunaOrdenacao) => void;
}) {
  function rotulo(coluna: ColunaOrdenacao, texto: string, className: string) {
    const ativa = ordenacao?.coluna === coluna;
    return (
      <button
        onClick={() => onOrdenar(coluna)}
        title={`Ordenar por ${texto.toLowerCase()} (clique de novo para inverter)`}
        className={`${className} text-left text-xs font-semibold uppercase tracking-wide hover:text-slate-900 ${ativa ? "text-slate-900" : "text-slate-400"}`}
      >
        {texto}
        {ativa ? (ordenacao.direcao === "asc" ? " ▲" : " ▼") : ""}
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 px-3">
      <span className="w-6 shrink-0" aria-hidden />
      {rotulo("codigo", "Código", "w-20 shrink-0")}
      {rotulo("ref", "Referência", "w-28 shrink-0")}
      {rotulo("descricao", "Descrição", "min-w-0 flex-1")}
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
  const [tipo, setTipo] = useState<CatalogTipo>("catalogo");
  // A seção já tem o card de destaque configurado? (sem ele, um item em
  // destaque é desenhado como item normal — o aviso abaixo explica.)
  const [temCardDestaque, setTemCardDestaque] = useState(true);
  // Ordenação por coluna (só Jornal de Ofertas). `ordemAnterior` guarda a ordem
  // de antes da última ordenação pra "Desfazer"; some ao arrastar/adicionar/remover.
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaOrdenacao; direcao: DirecaoOrdenacao } | null>(null);
  const [ordemAnterior, setOrdemAnterior] = useState<string[] | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function limparOrdenacao() {
    setOrdenacao(null);
    setOrdemAnterior(null);
  }

  async function refreshItems() {
    const res = await listSectionItems(sectionId);
    if (res.error) setError(res.error);
    else setItems(res.items ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSection(sectionId), getCatalog(catalogId), listSectionItems(sectionId), sectionTemDestaqueTemplate(sectionId)]).then(
      ([sectionRes, catalogRes, itemsRes, destaqueRes]) => {
        if (cancelled) return;
        if (!destaqueRes.error) setTemCardDestaque(destaqueRes.tem ?? false);
        if (sectionRes.error) setError(sectionRes.error);
        else setSectionTitulo(sectionRes.section?.titulo ?? null);

        if (catalogRes.error) setError(catalogRes.error);
        else {
          setPlanilhaId(catalogRes.catalog?.planilhaId ?? null);
          setTipo(catalogRes.catalog?.tipo ?? "catalogo");
        }

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
    limparOrdenacao();
    await refreshItems();
  }

  async function handleToggleDestaque(item: SectionItem) {
    setError(null);
    const novo = !item.destaque;
    const res = await setItemDestaque(item.id, novo);
    if (res.error) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, destaque: novo } : i)));
  }

  async function handleRemove(itemId: string) {
    setError(null);
    const res = await removeSectionItem(itemId);
    if (res.error) {
      setError(res.error);
      return;
    }
    limparOrdenacao();
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    limparOrdenacao();
    setItems(reordered);
    const res = await reorderSectionItems(reordered.map((i) => i.id));
    if (res.error) setError(res.error);
  }

  // Aplica uma ordem (lista de itens já ordenada) e grava — a visualização e
  // o PDF usam essa mesma ordem salva. Se a gravação falhar, volta ao que era.
  async function aplicarOrdem(novos: SectionItem[]) {
    const anteriores = items;
    setItems(novos);
    const res = await reorderSectionItems(novos.map((i) => i.id));
    if (res.error) {
      setItems(anteriores);
      setError(res.error);
      return false;
    }
    return true;
  }

  async function handleOrdenar(coluna: ColunaOrdenacao) {
    setError(null);
    const direcao: DirecaoOrdenacao = ordenacao?.coluna === coluna && ordenacao.direcao === "asc" ? "desc" : "asc";
    const idsAntes = items.map((i) => i.id);
    const ok = await aplicarOrdem(ordenarItensSecao(items, coluna, direcao));
    if (!ok) return;
    setOrdenacao({ coluna, direcao });
    // Só guarda o "antes" da PRIMEIRA ordenação em sequência — assim, ordenar
    // por Código e depois por Descrição ainda desfaz de volta à ordem original.
    setOrdemAnterior((prev) => prev ?? idsAntes);
  }

  async function handleDesfazerOrdenacao() {
    if (!ordemAnterior) return;
    setError(null);
    const porId = new Map(items.map((i) => [i.id, i]));
    const restaurada = ordemAnterior.map((id) => porId.get(id)).filter((i): i is SectionItem => !!i);
    if (restaurada.length !== items.length) {
      limparOrdenacao();
      return;
    }
    if (await aplicarOrdem(restaurada)) limparOrdenacao();
  }

  const ehJornal = tipo === "jornal_ofertas";

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
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Produtos desta seção ({items.length})
              </p>
              {ehJornal && ordemAnterior && (
                <button onClick={handleDesfazerOrdenacao} className="text-xs text-slate-500 underline hover:text-slate-800">
                  Desfazer ordenação
                </button>
              )}
            </div>
            {ehJornal && items.length > 1 && (
              <p className="mt-1 text-xs text-slate-400">
                Clique no título de uma coluna para ordenar (de novo inverte). Depois dá para ajustar arrastando.
              </p>
            )}
            {ehJornal && items.length > 1 && <CabecalhoOrdenacao ordenacao={ordenacao} onOrdenar={handleOrdenar} />}
            {items.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                ☆ Clique na estrela para marcar um produto como <b>destaque</b>: ele ocupa uma linha própria, na largura da grade, com o{" "}
                <Link href={`/catalogos/${catalogId}/secoes/${sectionId}/destaque`} className="underline hover:text-slate-600">
                  card de destaque
                </Link>{" "}
                da seção.
              </p>
            )}
            {!temCardDestaque && items.some((i) => i.destaque) && (
              <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                ⚠ Há produto(s) em destaque, mas esta seção ainda não tem o <b>card de destaque</b> — por enquanto eles aparecem como cards
                normais.{" "}
                <Link href={`/catalogos/${catalogId}/secoes/${sectionId}/destaque`} className="underline">
                  Criar o card de destaque
                </Link>
              </p>
            )}
            {items.length === 0 && <p className="mt-2 text-sm text-slate-400">Nenhum produto adicionado ainda.</p>}
            {items.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="mt-2 flex flex-col gap-2">
                    {items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onRemove={() => handleRemove(item.id)}
                        onToggleDestaque={() => handleToggleDestaque(item)}
                      />
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
