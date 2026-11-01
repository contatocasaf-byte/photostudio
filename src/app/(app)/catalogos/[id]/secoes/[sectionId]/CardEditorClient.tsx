"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getSection,
  getCardTemplate,
  listCardTemplateVersions,
  listSections,
  saveCardTemplate,
  type CardTemplateVersion,
  type CardVariante,
  type SaveCardTemplateMode,
  type Section,
} from "../../../actions";
import { sectionHasItems } from "../../../produtos/actions";
import {
  defaultCardBorda,
  defaultCardLayout,
  defaultCardShape,
  DEFAULT_CAMPOS_HABILITADOS,
  DEFAULT_CARD_WIDTH,
  DEFAULT_CARD_HEIGHT,
  type CardBorda,
  type CardFieldKey,
  type CardImageElementConfig,
  type CardLayout,
  type CardShape,
  type CardShapeType,
  type CardTextElementConfig,
} from "../../../core/cardConfig";
import CardEditorCanvas from "./CardEditorCanvas";
import { CardStructurePanel, ElementsPanel, SelectedElementPanel } from "./PropertiesPanel";
import FontManager from "@/components/fonts/FontManager";

// Serializa só os campos que definem a APARÊNCIA do card (nunca
// incluir sectionId/versao/ids) — usado pra comparar "o que está na
// tela agora" contra "o que acabou de ser copiado/carregado", e assim
// saber se o vínculo de "seguir outra seção" (ver segue_secao_id)
// ainda é válido ou já foi quebrado por uma edição manual.
function snapshotCard(input: {
  layout: CardLayout;
  camposHabilitados: CardFieldKey[];
  largura: number;
  alturaMinima: number;
  alturaCresceCom: CardFieldKey | null;
  gutterX: number | null;
  gutterY: number | null;
  shapes: CardShape[];
  borda: CardBorda;
}): string {
  return JSON.stringify(input);
}

export default function CardEditorPage({
  params,
  variante = "padrao",
}: {
  params: Promise<{ id: string; sectionId: string }>;
  variante?: CardVariante;
}) {
  const { id: catalogId, sectionId } = use(params);
  const ehDestaque = variante === "destaque";

  const [section, setSection] = useState<Section | null>(null);
  const [loading, setLoading] = useState(true);
  // Unidade de medida (px/mm) dos painéis da direita — uma só, compartilhada.
  const [unit, setUnit] = useState<"px" | "mm">("px");
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
  const [borda, setBorda] = useState<CardBorda>(() => defaultCardBorda());
  // Card de destaque: a largura é a da GRADE da seção ((colunas-1) x espaçamento
  // + largura do card padrão) e fica travada — null = sem card padrão ainda (aí
  // a largura é livre) ou editando o próprio card padrão.
  const [larguraGrade, setLarguraGrade] = useState<number | null>(null);
  const larguraTravada = ehDestaque && larguraGrade !== null;

  // Seleção múltipla (Ctrl+clique adiciona, Alt+clique retira, clique
  // simples substitui — ver SelectMode em CardEditorCanvas.tsx) — um
  // campo/forma pode estar selecionado junto com outros de qualquer tipo.
  const [selectedKeys, setSelectedKeys] = useState<CardFieldKey[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [gutterMode, setGutterMode] = useState(false);

  // Reaproveitar configuração de outra seção do mesmo catálogo — lista
  // as demais seções pra um seletor; "Copiar" só carrega os valores no
  // estado local (igual a abrir o card-molde da outra seção e trazer
  // pra cá), não persiste nada nem religa as duas seções ao mesmo
  // card_templates — o usuário ainda precisa clicar Salvar, e depois
  // disso as duas seções voltam a ser independentes (cada uma com sua
  // própria linha, editável separadamente).
  const [otherSections, setOtherSections] = useState<Section[]>([]);
  const [copySourceId, setCopySourceId] = useState("");
  const [copying, setCopying] = useState(false);

  // Vínculo "esta seção segue aquela" (pedido do usuário: manter a
  // dinâmica de "Reaproveitar" mas, opcionalmente, replicar
  // atualizações futuras da origem pra cá automaticamente).
  // followSourceId != null só enquanto a tela estiver EXATAMENTE igual
  // ao que foi copiado/carregado (ver isFollowDirty) — qualquer edição
  // manual depois disso já não persiste o vínculo no próximo Salvar,
  // sem precisar interceptar cada onChange do canvas/painel um por um.
  const [followSourceId, setFollowSourceId] = useState<string | null>(null);
  const [copiedSnapshot, setCopiedSnapshot] = useState<string | null>(null);
  const [replicarSeguidoras, setReplicarSeguidoras] = useState(true);

  // Versionamento pós-criação (Fase 5, Parte 8, spec 3.5) — a pergunta
  // "aplicar a todos vs. só aos novos" só faz sentido se a seção já
  // tem produto posicionado; sem isso, Salvar continua direto (sem
  // gerar versão nova, ver saveCardTemplate).
  const [hasItems, setHasItems] = useState(false);
  const [showVersionChoice, setShowVersionChoice] = useState(false);

  // Restaurar versão anterior (Fase 5, Parte 9) — mesma mecânica de
  // "Reaproveitar de outra seção": carrega os dados de uma versão
  // antiga no estado local, o usuário revisa e clica Salvar como
  // sempre (que já cria a versão nova, ver saveCardTemplate). Todas as
  // versões já vêm de uma vez no carregamento inicial, sem round-trip
  // extra ao clicar "Carregar". A primeira da lista (`versao` mais
  // alta) é sempre a versão atual — fica fora da lista de escolha.
  const [versions, setVersions] = useState<CardTemplateVersion[]>([]);
  const [restoreVersionId, setRestoreVersionId] = useState("");
  const olderVersions = versions.slice(1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSection(sectionId),
      getCardTemplate(sectionId, variante),
      listSections(catalogId),
      sectionHasItems(sectionId, variante),
      listCardTemplateVersions(sectionId, variante),
      // Só o card de destaque precisa do padrão (pra saber a largura da grade).
      ehDestaque ? getCardTemplate(sectionId, "padrao") : Promise.resolve(null),
    ]).then(([sectionRes, templateRes, sectionsRes, hasItemsRes, versionsRes, padraoRes]) => {
      if (cancelled) return;
      if (sectionRes.error) setError(sectionRes.error);
      else setSection(sectionRes.section ?? null);
      // O card de destaque não participa do "seguir outra seção".
      if (!sectionRes.error && !ehDestaque) setFollowSourceId(sectionRes.section?.segue_secao_id ?? null);

      let grade: number | null = null;
      if (ehDestaque && padraoRes?.template && sectionRes.section) {
        const p = padraoRes.template;
        grade = (sectionRes.section.colunas - 1) * (p.gutterX ?? p.largura + 20) + p.largura;
        setLarguraGrade(grade);
      }

      if (templateRes.error) setError(templateRes.error);
      else if (!templateRes.template && grade !== null) {
        // Card de destaque novo: começa já na largura da grade.
        setLargura(grade);
        setAlturaMinima(260);
        setLayout(defaultCardLayout(grade, 260));
      } else if (templateRes.template) {
        const t = templateRes.template;
        // Mescla por cima dos padrões (mesmo padrão já usado no editor
        // de página) — sem isso, um card-molde salvo com uma versão
        // antiga dos campos (ex.: antes da Parte 6a renomear nome/sku/
        // preco pra codigo/ref/preco_1/preco_2) deixa os campos NOVOS
        // com config `undefined`, quebrando o canvas inteiro ao tentar
        // desenhar um campo sem posição/tamanho.
        const merged = { ...defaultCardLayout(t.largura, t.alturaMinima), ...t.layout };
        const campos = t.camposHabilitados.length > 0 ? t.camposHabilitados : DEFAULT_CAMPOS_HABILITADOS;
        const bordaVal = t.borda ?? defaultCardBorda();
        setLayout(merged);
        setCamposHabilitados(campos);
        setLargura(grade ?? t.largura);
        setAlturaMinima(t.alturaMinima);
        setAlturaCresceCom(t.alturaCresceCom);
        setGutterX(t.gutterX);
        setGutterY(t.gutterY);
        setShapes(t.shapes);
        setBorda(bordaVal);
        // Ponto de partida pra comparação de "ainda igual ao que veio
        // salvo" (ver isFollowDirty) — sem isso, uma seção que já
        // segue outra ao ser recarregada seria tratada como "editada"
        // na primeira renderização, quebrando o vínculo à toa.
        setCopiedSnapshot(
          snapshotCard({
            layout: merged,
            camposHabilitados: campos,
            largura: t.largura,
            alturaMinima: t.alturaMinima,
            alturaCresceCom: t.alturaCresceCom,
            gutterX: t.gutterX,
            gutterY: t.gutterY,
            shapes: t.shapes,
            borda: bordaVal,
          })
        );
      }
      if (!sectionsRes.error) setOtherSections((sectionsRes.sections ?? []).filter((s) => s.id !== sectionId));
      if (!hasItemsRes.error) setHasItems(hasItemsRes.hasItems ?? false);
      if (!versionsRes.error) setVersions(versionsRes.versions ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sectionId, catalogId, variante, ehDestaque]);

  async function handleCopyFrom() {
    if (!copySourceId) return;
    setCopying(true);
    setStatus(null);
    try {
      const res = await getCardTemplate(copySourceId, variante);
      if (res.error) {
        setStatus(`⚠ ${res.error}`);
        return;
      }
      if (!res.template) {
        setStatus("⚠ Essa seção ainda não tem um card-molde configurado.");
        return;
      }
      const t = res.template;
      const merged = { ...defaultCardLayout(t.largura, t.alturaMinima), ...t.layout };
      const campos = t.camposHabilitados.length > 0 ? t.camposHabilitados : DEFAULT_CAMPOS_HABILITADOS;
      const bordaVal = t.borda ?? defaultCardBorda();
      setLayout(merged);
      setCamposHabilitados(campos);
      setLargura(larguraTravada ? (larguraGrade as number) : t.largura);
      setAlturaMinima(t.alturaMinima);
      setAlturaCresceCom(t.alturaCresceCom);
      setGutterX(t.gutterX);
      setGutterY(t.gutterY);
      setShapes(t.shapes);
      setBorda(bordaVal);
      handleClearSelection();
      // Marca a origem copiada como "seguida" — só é persistido de
      // verdade se o Salvar acontecer sem nenhuma edição no meio (ver
      // isFollowDirty); editar qualquer coisa depois de copiar já
      // desfaz essa intenção automaticamente.
      if (!ehDestaque) setFollowSourceId(copySourceId);
      setCopiedSnapshot(
        snapshotCard({
          layout: merged,
          camposHabilitados: campos,
          largura: t.largura,
          alturaMinima: t.alturaMinima,
          alturaCresceCom: t.alturaCresceCom,
          gutterX: t.gutterX,
          gutterY: t.gutterY,
          shapes: t.shapes,
          borda: bordaVal,
        })
      );
      setStatus("✔ Configuração copiada — clique em Salvar pra aplicar nesta seção (fica sincronizada com essa origem enquanto você não editar nada).");
    } finally {
      setCopying(false);
    }
  }

  function handleUnfollow() {
    setFollowSourceId(null);
    setCopiedSnapshot(null);
    setStatus("Vínculo removido — clique em Salvar pra confirmar.");
  }

  function handleLoadVersion(v: CardTemplateVersion) {
    const t = v.template;
    setLayout({ ...defaultCardLayout(t.largura, t.alturaMinima), ...t.layout });
    setCamposHabilitados(t.camposHabilitados.length > 0 ? t.camposHabilitados : DEFAULT_CAMPOS_HABILITADOS);
    setLargura(larguraTravada ? (larguraGrade as number) : t.largura);
    setAlturaMinima(t.alturaMinima);
    setAlturaCresceCom(t.alturaCresceCom);
    setGutterX(t.gutterX);
    setGutterY(t.gutterY);
    setShapes(t.shapes);
    setBorda(t.borda ?? defaultCardBorda());
    handleClearSelection();
    setStatus(`✔ Versão ${v.versao} carregada — clique em Salvar pra restaurar.`);
  }

  function handleToggleCampo(key: CardFieldKey, habilitado: boolean) {
    setCamposHabilitados((prev) => (habilitado ? [...prev, key] : prev.filter((k) => k !== key)));
    if (!habilitado) setSelectedKeys((prev) => prev.filter((k) => k !== key));
    if (!habilitado && alturaCresceCom === key) setAlturaCresceCom(null);
  }

  function handleUpdateField(key: CardFieldKey, patch: Partial<CardImageElementConfig & CardTextElementConfig>) {
    setLayout((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // "replace" (clique simples) troca a seleção inteira por só o item
  // clicado, limpando a seleção do OUTRO tipo também — igual ao
  // comportamento de antes da multi-seleção. "add"/"remove" (Ctrl/Alt)
  // só mexem no próprio array, permitindo misturar campos e formas na
  // mesma seleção.
  function handleSelectField(key: CardFieldKey, mode: "replace" | "add" | "remove") {
    if (mode === "replace") {
      setSelectedShapeIds([]);
      setSelectedKeys([key]);
    } else if (mode === "add") {
      setSelectedKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    } else {
      setSelectedKeys((prev) => prev.filter((k) => k !== key));
    }
  }

  function handleSelectShape(id: string, mode: "replace" | "add" | "remove") {
    if (mode === "replace") {
      setSelectedKeys([]);
      setSelectedShapeIds([id]);
    } else if (mode === "add") {
      setSelectedShapeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedShapeIds((prev) => prev.filter((s) => s !== id));
    }
  }

  function handleClearSelection() {
    setSelectedKeys([]);
    setSelectedShapeIds([]);
  }

  function handleAddShape(type: CardShapeType) {
    const shape = defaultCardShape(type, crypto.randomUUID());
    setShapes((prev) => [...prev, shape]);
    handleSelectShape(shape.id, "replace");
  }

  function handleUpdateShape(id: string, patch: Partial<CardShape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function handleRemoveShape(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
    setSelectedShapeIds((prev) => prev.filter((s) => s !== id));
  }

  // Move todo campo/forma selecionado com as setas do teclado (1px, ou
  // 10px com Shift) — ignora quando o foco está num campo de texto do
  // painel de propriedades, senão roubaria a digitação de número/texto.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      if (selectedKeys.length === 0 && selectedShapeIds.length === 0) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      if (selectedKeys.length > 0) {
        setLayout((prev) => {
          const next = { ...prev };
          for (const key of selectedKeys) {
            const cfg = next[key];
            next[key] = { ...cfg, x: (cfg?.x ?? 0) + dx, y: (cfg?.y ?? 0) + dy };
          }
          return next;
        });
      }
      if (selectedShapeIds.length > 0) {
        setShapes((prev) => prev.map((s) => (selectedShapeIds.includes(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s)));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedKeys, selectedShapeIds]);

  function handleResizeBoundary(patch: { largura: number; alturaMinima: number }) {
    // Card de destaque: largura travada na da grade.
    setLargura(larguraTravada ? (larguraGrade as number) : patch.largura);
    setAlturaMinima(patch.alturaMinima);
  }

  // Borda de cima/esquerda do card arrastada: os campos e formas andam -dx/-dy
  // (as coordenadas deles são relativas ao canto superior-esquerdo do card)
  // pra ficarem no mesmo lugar da tela.
  function handleShiftContent(dx: number, dy: number) {
    setLayout((prev) => {
      const next = { ...prev } as Record<string, { x: number; y: number }>;
      for (const key of Object.keys(next)) next[key] = { ...next[key], x: next[key].x - dx, y: next[key].y - dy };
      return next as unknown as CardLayout;
    });
    setShapes((prev) => prev.map((s) => ({ ...s, x: s.x - dx, y: s.y - dy })));
  }

  function handleGutterChange(patch: { gutterX: number; gutterY: number }) {
    setGutterX(patch.gutterX);
    setGutterY(patch.gutterY);
  }

  function handleUpdateBorda(patch: Partial<CardBorda>) {
    setBorda((prev) => ({ ...prev, ...patch }));
  }

  // Seções que seguem ESTA (ver segue_secao_id) — ao salvar aqui, o
  // usuário pode escolher replicar a mudança pra elas também.
  const followers = ehDestaque ? [] : otherSections.filter((s) => s.segue_secao_id === sectionId);

  // Estado atual comparado ao que foi copiado/carregado por último
  // (ver copiedSnapshot) — qualquer edição depois disso já invalida o
  // vínculo de "seguir", sem precisar interceptar cada onChange do
  // canvas/painel um por um.
  const currentSnapshot = useMemo(
    () => snapshotCard({ layout, camposHabilitados, largura, alturaMinima, alturaCresceCom, gutterX, gutterY, shapes, borda }),
    [layout, camposHabilitados, largura, alturaMinima, alturaCresceCom, gutterX, gutterY, shapes, borda]
  );
  const isFollowDirty = followSourceId !== null && copiedSnapshot !== null && currentSnapshot !== copiedSnapshot;
  const followSourceTitle = followSourceId ? (otherSections.find((s) => s.id === followSourceId)?.titulo ?? "outra seção") : null;

  // Seção sem produto posicionado e sem seguidoras: salva direto (nada
  // pra perguntar). Com produto posicionado e/ou seguidoras: mostra a
  // escolha antes de salvar de verdade (ver `doSave`).
  function handleSave() {
    if (hasItems || followers.length > 0) {
      setReplicarSeguidoras(true);
      setShowVersionChoice(true);
      return;
    }
    doSave("aplicar_todos");
  }

  async function doSave(modo: SaveCardTemplateMode) {
    setSaving(true);
    setStatus(null);
    setShowVersionChoice(false);
    try {
      const segueSecaoId = followSourceId !== null && !isFollowDirty ? followSourceId : null;
      const res = await saveCardTemplate(
        sectionId,
        {
          layout,
          largura,
          alturaMinima,
          alturaCresceCom,
          camposHabilitados,
          gutterX,
          gutterY,
          shapes,
          borda,
        },
        modo,
        segueSecaoId,
        followers.length > 0 && replicarSeguidoras,
        variante
      );
      setStatus(res.error ? `⚠ ${res.error}` : ehDestaque ? "✔ Card de destaque salvo." : "✔ Card-molde salvo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando card-molde...</p>;

  const rotuloCard = ehDestaque ? "Card de destaque" : "Card-molde";

  return (
    <div>
      <Link href={`/catalogos/${catalogId}`} className="text-xs text-slate-500 hover:text-slate-700">
        ← {section ? section.titulo : "Voltar"}
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {rotuloCard} — {section?.titulo}
        </h1>
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
      {ehDestaque && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>
            ★ Este card é usado nos produtos marcados como <b>destaque</b> na tela de Produtos da seção: cada um ocupa uma linha própria, na
            largura da grade.{" "}
            {larguraTravada
              ? `A largura (${Math.round(larguraGrade as number)} px) é a da grade e não pode ser alterada aqui — só a altura.`
              : "Esta seção ainda não tem o card padrão; a largura fica livre até ele existir (depois a largura passa a ser a da grade)."}
          </p>
          <p className="mt-1">
            <Link href={`/catalogos/${catalogId}/secoes/${sectionId}`} className="underline hover:text-amber-700">
              Ir para o card padrão
            </Link>
          </p>
        </div>
      )}
      {!ehDestaque && (
        <p className="mt-1 text-xs text-slate-400">
          <Link href={`/catalogos/${catalogId}/secoes/${sectionId}/destaque`} className="underline hover:text-slate-600">
            Editar o card de destaque desta seção
          </Link>
        </p>
      )}
      <FontManager />

      {otherSections.length > 0 && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Reaproveitar configuração de:</label>
            <select
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">Selecione uma seção...</option>
              {/* Não deixa seguir uma seção que já segue esta — evita
                  um vínculo circular direto (A segue B, B segue A). */}
              {otherSections
                .filter((s) => s.segue_secao_id !== sectionId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.numero ? `${s.numero} — ${s.titulo}` : s.titulo}
                  </option>
                ))}
            </select>
            <button
              onClick={handleCopyFrom}
              disabled={!copySourceId || copying}
              className="rounded-md bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            >
              {copying ? "Copiando..." : "Copiar"}
            </button>
          </div>
          {followSourceId && (
            <p className="mt-2 text-xs text-slate-500">
              {isFollowDirty
                ? "⚠ Alterado desde a cópia — não será salvo como sincronizado."
                : `✓ Será salvo como sincronizado com ${followSourceTitle} — atualizações futuras nela podem ser replicadas aqui.`}{" "}
              <button type="button" onClick={handleUnfollow} className="underline hover:text-slate-700">
                Parar de seguir
              </button>
            </p>
          )}
        </div>
      )}

      {olderVersions.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <label className="text-xs text-slate-500">Versões anteriores:</label>
          <select
            value={restoreVersionId}
            onChange={(e) => setRestoreVersionId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Selecione uma versão...</option>
            {olderVersions.map((v) => (
              <option key={v.id} value={v.id}>
                Versão {v.versao} — {new Date(v.criadoEm).toLocaleString("pt-BR")}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const v = olderVersions.find((v) => v.id === restoreVersionId);
              if (v) handleLoadVersion(v);
            }}
            disabled={!restoreVersionId}
            className="rounded-md bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
          >
            Carregar
          </button>
        </div>
      )}

      {showVersionChoice && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          {hasItems && <p className="font-medium">Esta seção já tem produtos posicionados. Aplicar essa alteração a:</p>}
          {followers.length > 0 && (
            <label className="mt-2 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={replicarSeguidoras}
                onChange={(e) => setReplicarSeguidoras(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Replicar esta atualização pras seções que seguem este card: {followers.map((f) => f.titulo).join(", ")}
              </span>
            </label>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {hasItems ? (
              <>
                <button
                  onClick={() => doSave("aplicar_todos")}
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Todos os produtos já posicionados
                </button>
                <button
                  onClick={() => doSave("aplicar_novos")}
                  disabled={saving}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Só aos novos a partir de agora
                </button>
              </>
            ) : (
              <button
                onClick={() => doSave("aplicar_todos")}
                disabled={saving}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Salvar
              </button>
            )}
            <button
              onClick={() => setShowVersionChoice(false)}
              disabled={saving}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-amber-800 hover:underline disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {status && <p className="mt-2 text-xs text-slate-500">{status}</p>}

      {/* Grid 2x2 (pedido do usuário, pra melhorar usabilidade): canvas
          + ajustes estruturais do card na linha de cima; lista de
          elementos (embaixo do canvas) + propriedades do item
          selecionado (ao lado dessa lista) na linha de baixo. */}
      <div className="mt-4 grid grid-cols-[auto_18rem] items-start gap-4">
        <div className="col-start-1 row-start-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          <CardEditorCanvas
            layout={layout}
            onLayoutChange={setLayout}
            camposHabilitados={camposHabilitados}
            largura={largura}
            alturaMinima={alturaMinima}
            onResizeBoundary={handleResizeBoundary}
            onShiftContent={handleShiftContent}
            selectedKeys={selectedKeys}
            onSelectField={handleSelectField}
            gutterMode={gutterMode}
            gutterX={gutterX}
            gutterY={gutterY}
            onGutterChange={handleGutterChange}
            shapes={shapes}
            onShapesChange={setShapes}
            selectedShapeIds={selectedShapeIds}
            onSelectShape={handleSelectShape}
            onClearSelection={handleClearSelection}
            borda={borda}
            larguraTravada={larguraTravada}
          />
        </div>

        {/* Painel de propriedades ÚNICO, ao lado do canvas: mostra a
            "Estrutura do card" quando nada está selecionado (ou ela foi
            escolhida na lista) e as propriedades do campo/forma
            selecionado nos demais casos. Acompanha a rolagem (sticky). */}
        <div className="col-start-2 row-span-2 row-start-1 self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
          {selectedKeys.length + selectedShapeIds.length === 0 ? (
            <CardStructurePanel
              largura={largura}
              alturaMinima={alturaMinima}
              onResizeBoundary={handleResizeBoundary}
              gutterMode={gutterMode}
              onToggleGutterMode={setGutterMode}
              gutterX={gutterX}
              gutterY={gutterY}
              onGutterChange={handleGutterChange}
              borda={borda}
              onUpdateBorda={handleUpdateBorda}
              unit={unit}
              onUnitChange={setUnit}
              larguraTravada={larguraTravada}
            />
          ) : (
            <SelectedElementPanel
              layout={layout}
              selectedKeys={selectedKeys}
              onUpdateField={handleUpdateField}
              shapes={shapes}
              selectedShapeIds={selectedShapeIds}
              onUpdateShape={handleUpdateShape}
              onRemoveShape={handleRemoveShape}
              unit={unit}
              onUnitChange={setUnit}
            />
          )}
        </div>

        <div className="col-start-1 row-start-2">
          <ElementsPanel
            camposHabilitados={camposHabilitados}
            onToggleCampo={handleToggleCampo}
            selectedKeys={selectedKeys}
            onSelectField={handleSelectField}
            alturaCresceCom={alturaCresceCom}
            onChangeAlturaCresceCom={setAlturaCresceCom}
            shapes={shapes}
            selectedShapeIds={selectedShapeIds}
            onSelectShape={handleSelectShape}
            onAddShape={handleAddShape}
            estruturaSelecionada={selectedKeys.length + selectedShapeIds.length === 0}
            onSelectEstrutura={handleClearSelection}
          />
        </div>
      </div>
    </div>
  );
}
