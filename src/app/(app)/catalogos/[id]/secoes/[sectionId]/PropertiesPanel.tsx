"use client";

import {
  CARD_FIELD_DEFS,
  CARD_SHAPE_TYPES,
  DEFAULT_FONT_FAMILY,
  defaultCardFundo,
  type CardBorda,
  type CardFieldKey,
  type CardFundo,
  type CardImageElementConfig,
  type CardLayout,
  type CardShape,
  type CardShapeType,
  type CardTextElementConfig,
} from "../../../core/cardConfig";
import { alturaAutomaticaTexto, alturaCaixaTexto, chaveTexto, listarTextos, tamanhoDoElemento } from "../../../core/cardElementos";
import { mmToPx, pxToMm } from "../../../core/pageConfig";
import type { TextAlign } from "@/lib/canvasText";
import FontPicker from "@/components/fonts/FontPicker";

type SelectMode = "replace" | "add" | "remove";

function getClickMode(e: React.MouseEvent): SelectMode {
  if (e.altKey) return "remove";
  if (e.ctrlKey || e.metaKey) return "add";
  return "replace";
}

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

type Unidade = "px" | "mm";

// Campo de cor (seletor + código hexadecimal) e de transparência — antes
// repetidos, idênticos, no contorno do card, nas formas e nos textos.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (cor: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-slate-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-slate-300"
        />
        <input
          key={value}
          defaultValue={value}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onChange(v);
          }}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}

function OpacityField({ value, onChange }: { value: number; onChange: (opacidade: number) => void }) {
  return (
    <div>
      <label className="flex items-center justify-between text-xs text-slate-500">
        <span>Transparência</span>
        <span>{Math.round(value * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-1 w-full"
      />
    </div>
  );
}

// Fundo de cor (liga/desliga + cor + transparência) — usado no card inteiro e
// na Foto do Produto.
function FundoFields({ fundo, rotulo, onChange }: { fundo?: CardFundo; rotulo: string; onChange: (f: CardFundo) => void }) {
  const f = fundo ?? defaultCardFundo();
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={f.ativo} onChange={(e) => onChange({ ...f, ativo: e.target.checked })} />
        {rotulo}
      </label>
      {f.ativo && (
        <>
          <ColorField label="Cor" value={f.cor} onChange={(cor) => onChange({ ...f, cor })} />
          <OpacityField value={f.opacidade} onChange={(opacidade) => onChange({ ...f, opacidade })} />
        </>
      )}
    </div>
  );
}

// Cada painel é um CARTÃO com título e seções separadas por linha — antes o
// painel de estrutura e o do elemento selecionado ficavam empilhados na mesma
// coluna sem moldura nem divisão, e não dava pra ver onde um terminava e o
// outro começava. `destaque` pinta o cartão do elemento selecionado.
function PanelCard({
  titulo,
  acao,
  destaque,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  destaque?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={"overflow-hidden rounded-lg border bg-white shadow-sm " + (destaque ? "border-sky-300" : "border-slate-200")}>
      <div
        className={
          "flex min-h-[2.5rem] items-center justify-between gap-2 border-b px-3 py-2 " +
          (destaque ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50")
        }
      >
        <h2 className={"text-xs font-semibold uppercase tracking-wide " + (destaque ? "text-sky-800" : "text-slate-600")}>{titulo}</h2>
        {acao}
      </div>
      <div className="divide-y divide-slate-100 px-3">{children}</div>
    </div>
  );
}

// `acao` = botão à direita do subtítulo (ex.: "+ Texto").
function Secao({ titulo, acao, children }: { titulo?: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="py-3">
      {(titulo || acao) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {titulo ? <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3> : <span />}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

// Painel dividido em 3 blocos posicionados separadamente pelo container
// (page.tsx, grid 2x2: canvas+estrutura na linha de cima, campos+
// propriedades do selecionado na linha de baixo) — pedido do usuário
// pra melhorar usabilidade: ajustes estruturais do card (tamanho/
// gutter/contorno) ficam ao lado do canvas, a lista de elementos fica
// embaixo do canvas, e as propriedades do item selecionado ficam ao
// lado dessa lista, não mais tudo empilhado numa coluna só.

export type CardStructurePanelProps = {
  largura: number;
  alturaMinima: number;
  onResizeBoundary: (patch: { largura: number; alturaMinima: number }) => void;
  gutterMode: boolean;
  onToggleGutterMode: (v: boolean) => void;
  gutterX: number | null;
  gutterY: number | null;
  onGutterChange: (patch: { gutterX: number; gutterY: number }) => void;
  borda: CardBorda;
  onUpdateBorda: (patch: Partial<CardBorda>) => void;
  // Unidade (px/mm) compartilhada com o painel do elemento selecionado.
  unit: Unidade;
  onUnitChange: (u: Unidade) => void;
  // Largura travada na da grade (card de destaque).
  larguraTravada?: boolean;
};

export function CardStructurePanel({
  largura,
  alturaMinima,
  onResizeBoundary,
  gutterMode,
  onToggleGutterMode,
  gutterX,
  gutterY,
  onGutterChange,
  borda,
  onUpdateBorda,
  unit,
  onUnitChange,
  larguraTravada = false,
}: CardStructurePanelProps) {
  function toDisplay(px: number) {
    return unit === "mm" ? pxToMm(px) : Math.round(px);
  }
  function fromDisplay(v: number) {
    return unit === "mm" ? mmToPx(v) : Math.round(v);
  }

  return (
    <PanelCard titulo="Estrutura do card" acao={<UnitToggle unit={unit} onChange={onUnitChange} />}>
      <Secao titulo="Tamanho">
        <div className="flex flex-col gap-2">
          {larguraTravada ? (
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-slate-500">Largura ({unit})</label>
              <span className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-500" title="Igual à largura da grade da seção">
                {toDisplay(largura)}
              </span>
            </div>
          ) : (
            <NumberField
              label={`Largura (${unit})`}
              value={toDisplay(largura)}
              onCommit={(v) => onResizeBoundary({ largura: Math.max(fromDisplay(v), 60), alturaMinima })}
            />
          )}
          {larguraTravada && <p className="text-[11px] text-slate-400">Travada na largura da grade da seção.</p>}
          <NumberField
            label={`Altura mínima (${unit})`}
            value={toDisplay(alturaMinima)}
            onCommit={(v) => onResizeBoundary({ largura, alturaMinima: Math.max(fromDisplay(v), 60) })}
          />
        </div>
      </Secao>

      <Secao titulo="Fundo">
        <FundoFields
          fundo={borda.fundo}
          rotulo="Cor de fundo do card"
          onChange={(fundo) => onUpdateBorda({ fundo })}
        />
      </Secao>

      <Secao titulo="Cantos">
        <NumberField
          label={`Arredondar cantos (${unit})`}
          value={toDisplay(borda.raio ?? 0)}
          onCommit={(v) => onUpdateBorda({ raio: Math.max(0, fromDisplay(v)) })}
        />
        <p className="mt-1 text-[11px] text-slate-400">O fundo e o contorno do card acompanham o arredondamento.</p>
      </Secao>

      <Secao titulo="Espaçamento entre cards">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={gutterMode} onChange={(e) => onToggleGutterMode(e.target.checked)} />
          Definir espaçamento (gutter)
        </label>
        {gutterMode && (
          <p className="mt-1 text-[11px] text-slate-400">
            Arraste a cópia semitransparente pra onde o próximo card da grade deve ficar, ou digite os valores abaixo.
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <NumberField
            label={`Espaçamento X (${unit})`}
            value={toDisplay(gutterX ?? 0)}
            onCommit={(v) => onGutterChange({ gutterX: fromDisplay(v), gutterY: gutterY ?? 0 })}
          />
          <NumberField
            label={`Espaçamento Y (${unit})`}
            value={toDisplay(gutterY ?? 0)}
            onCommit={(v) => onGutterChange({ gutterX: gutterX ?? 0, gutterY: fromDisplay(v) })}
          />
        </div>
      </Secao>

      <Secao titulo="Contorno">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={borda.ativa} onChange={(e) => onUpdateBorda({ ativa: e.target.checked })} />
          Contorno do card na grade
        </label>
        {borda.ativa && (
          <div className="mt-2 flex flex-col gap-3">
            <ColorField label="Cor" value={borda.cor} onChange={(cor) => onUpdateBorda({ cor })} />
            <OpacityField value={borda.opacidade} onChange={(opacidade) => onUpdateBorda({ opacidade })} />
            <NumberField
              label="Espessura"
              value={borda.espessura}
              onCommit={(v) => onUpdateBorda({ espessura: Math.max(0.5, v) })}
            />
          </div>
        )}
      </Secao>
    </PanelCard>
  );
}

export type ElementsPanelProps = {
  camposHabilitados: CardFieldKey[];
  onToggleCampo: (key: CardFieldKey, habilitado: boolean) => void;
  selectedKeys: CardFieldKey[];
  onSelectField: (key: CardFieldKey, mode: SelectMode) => void;
  alturaCresceCom: CardFieldKey | null;
  onChangeAlturaCresceCom: (key: CardFieldKey | null) => void;
  shapes: CardShape[];
  selectedShapeIds: string[];
  onSelectShape: (id: string, mode: SelectMode) => void;
  onAddShape: (type: CardShapeType) => void;
  // Textos livres moram no layout ("texto:<id>"); "+ Texto" cria um novo.
  layout: CardLayout;
  onAddTexto: () => void;
  // "Estrutura do card" é um item da lista, como os campos: selecionada
  // quando não há campo/forma selecionado.
  onToggleTexto: (id: string, visivel: boolean) => void;
  estruturaSelecionada: boolean;
  onSelectEstrutura: () => void;
};

export function ElementsPanel({
  camposHabilitados,
  onToggleCampo,
  selectedKeys,
  onSelectField,
  alturaCresceCom,
  onChangeAlturaCresceCom,
  shapes,
  selectedShapeIds,
  onSelectShape,
  onAddShape,
  layout,
  onAddTexto,
  onToggleTexto,
  estruturaSelecionada,
  onSelectEstrutura,
}: ElementsPanelProps) {
  const camposTexto = CARD_FIELD_DEFS.filter((d) => d.type === "text" && camposHabilitados.includes(d.key));
  const textosLivres = listarTextos(layout);
  const emGrupoCampo = (chave: string) => !!(layout[chave] as { grupo?: string } | undefined)?.grupo;
  const marcaGrupo = (ativo: boolean) =>
    ativo ? (
      <span className="ml-auto shrink-0 rounded bg-sky-100 px-1 text-[9px] font-semibold uppercase text-sky-700" title="Faz parte de um grupo">
        grupo
      </span>
    ) : null;

  return (
    <PanelCard titulo="Card">
      <Secao titulo="Estrutura">
        <button
          onClick={onSelectEstrutura}
          className={
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium " +
            (estruturaSelecionada ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
          }
        >
          Estrutura do card
          <span className={"ml-auto text-[10px] font-normal " + (estruturaSelecionada ? "text-slate-300" : "text-slate-400")}>
            tamanho, fundo, cantos, contorno
          </span>
        </button>
      </Secao>

      <Secao titulo="Campos">
        <div className="flex flex-col gap-1">
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
                {marcaGrupo(habilitado && emGrupoCampo(def.key))}
              </div>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Altura do card">
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
      </Secao>

      <Secao
        titulo="Textos"
        acao={
          <button
            onClick={onAddTexto}
            className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            + Texto
          </button>
        }
      >
        {textosLivres.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum texto. Use &quot;+ Texto&quot; para um rótulo fixo (ex.: Oferta destaque).</p>
        ) : (
          <div className="flex flex-col gap-1">
            {textosLivres.map((t, i) => {
              const visivel = !t.oculto;
              return (
                <div
                  key={t.id}
                  className={
                    "flex items-center gap-2 rounded-md px-2 py-1.5 " +
                    (selectedShapeIds.includes(t.id) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700")
                  }
                >
                  <input
                    type="checkbox"
                    checked={visivel}
                    onChange={(e) => onToggleTexto(t.id, e.target.checked)}
                    title="Mostrar / ocultar este texto (no editor, na visualização e no PDF)"
                    className="shrink-0"
                  />
                  <button
                    onClick={(e) => visivel && onSelectShape(t.id, getClickMode(e))}
                    disabled={!visivel}
                    className={"flex-1 truncate text-left text-xs font-medium " + (visivel ? "" : "opacity-40")}
                  >
                    Texto {i + 1}
                    <span className={"ml-1 font-normal " + (selectedShapeIds.includes(t.id) ? "text-slate-300" : "text-slate-400")}>
                      {t.text ? `“${t.text.length > 18 ? t.text.slice(0, 18) + "…" : t.text}”` : ""}
                    </span>
                  </button>
                  {marcaGrupo(visivel && emGrupoCampo(chaveTexto(t.id)))}
                </div>
              );
            })}
          </div>
        )}
      </Secao>

      <Secao titulo="Formas">
        <div className="grid grid-cols-3 gap-1">
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
                  {marcaGrupo(!!shape.grupo)}
                </button>
              );
            })}
          </div>
        )}
      </Secao>
    </PanelCard>
  );
}

export type SelectedElementPanelProps = {
  layout: CardLayout;
  selectedKeys: CardFieldKey[];
  onUpdateField: (key: CardFieldKey, patch: Partial<CardImageElementConfig & CardTextElementConfig>) => void;
  shapes: CardShape[];
  selectedShapeIds: string[];
  onUpdateShape: (id: string, patch: Partial<CardShape>) => void;
  onRemoveShape: (id: string) => void;
  onUpdateTexto: (id: string, patch: Partial<CardTextElementConfig>) => void;
  // Ids dos elementos selecionados na ORDEM em que foram selecionados: o último
  // é a referência do "Centralizar".
  ordemSelecao: string[];
  // Ações sobre a seleção (duplicar / agrupar / desagrupar / excluir).
  acoes: AcoesSelecao;
  // Unidade (px/mm) compartilhada com o painel de estrutura.
  unit: Unidade;
  onUnitChange: (u: Unidade) => void;
};

export type AcoesSelecao = {
  podeDuplicar: boolean;
  podeAgrupar: boolean;
  temGrupo: boolean;
  podeExcluir: boolean;
  onDuplicar: () => void;
  onAgrupar: () => void;
  onDesagrupar: () => void;
  onExcluir: () => void;
};

// Uma linha da tabela "Cada elemento": nome + X e Y editáveis (confirma ao sair
// do campo, como os outros campos numéricos).
function PosicaoDoElemento({ nome, x, y, onCommit }: { nome: string; x: number; y: number; onCommit: (x: number, y: number) => void }) {
  const campo = (valor: number, ao: (v: number) => void) => (
    <input
      type="number"
      defaultValue={Math.round(valor)}
      key={valor}
      onBlur={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) ao(n);
      }}
      className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs"
    />
  );
  return (
    <>
      <span className="truncate text-xs text-slate-700" title={nome}>
        {nome}
      </span>
      {campo(x, (v) => onCommit(v, y))}
      {campo(y, (v) => onCommit(x, v))}
    </>
  );
}

function BarraDeAcoes({ acoes }: { acoes: AcoesSelecao }) {
  const botao = (rotulo: string, ativo: boolean, onClick: () => void, titulo: string, perigo = false) => (
    <button
      onClick={onClick}
      disabled={!ativo}
      title={titulo}
      className={
        "rounded-md px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 " +
        (perigo ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
      }
    >
      {rotulo}
    </button>
  );
  return (
    <Secao titulo="Ações">
      <div className="grid grid-cols-2 gap-1">
        {botao("Duplicar", acoes.podeDuplicar, acoes.onDuplicar, "Duplica formas e textos da seleção (Ctrl+D). Campos fixos (foto, código…) existem uma vez só.")}
        {botao("Agrupar", acoes.podeAgrupar, acoes.onAgrupar, "Junta 2 ou mais elementos: mexer em um move o grupo todo (Ctrl+G)")}
        {botao("Desagrupar", acoes.temGrupo, acoes.onDesagrupar, "Desfaz o grupo da seleção (Ctrl+Shift+G)")}
        {botao("Excluir", acoes.podeExcluir, acoes.onExcluir, "Exclui as formas e textos da seleção (Delete)", true)}
      </div>
    </Secao>
  );
}

function UnitToggle({ unit, onChange }: { unit: Unidade; onChange: (u: Unidade) => void }) {
  return (
    <div className="flex gap-1">
      {(["px", "mm"] as const).map((u) => (
        <button
          key={u}
          onClick={() => onChange(u)}
          className={
            "rounded-md px-2 py-1 text-xs font-medium " +
            (unit === u ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
          }
        >
          {u}
        </button>
      ))}
    </div>
  );
}

export function SelectedElementPanel({
  layout,
  selectedKeys,
  onUpdateField,
  shapes,
  selectedShapeIds,
  onUpdateShape,
  onRemoveShape,
  onUpdateTexto,
  ordemSelecao,
  acoes,
  unit,
  onUnitChange,
}: SelectedElementPanelProps) {
  const selectionCount = selectedKeys.length + selectedShapeIds.length;
  const selectedDef = selectedKeys.length === 1 ? CARD_FIELD_DEFS.find((d) => d.key === selectedKeys[0]) : null;
  const selectedShape = selectedShapeIds.length === 1 ? shapes.find((s) => s.id === selectedShapeIds[0]) : null;
  // Texto livre selecionado (os ids de textos ficam junto com os das formas).
  const selectedTextoId =
    selectedShapeIds.length === 1 && selectedKeys.length === 0 && !selectedShape && chaveTexto(selectedShapeIds[0]) in layout
      ? selectedShapeIds[0]
      : null;

  function toDisplay(px: number) {
    return unit === "mm" ? pxToMm(px) : Math.round(px);
  }
  function fromDisplay(v: number) {
    return unit === "mm" ? mmToPx(v) : Math.round(v);
  }

  // --- Seleção múltipla / grupo: posição de cada elemento e da seleção -------
  // Cada item sabe o próprio nome, posição e como se mover — assim dá pra digitar
  // X/Y de cada um (ex.: dois elementos na mesma altura), mover a seleção inteira
  // pelo canto dela ou alinhar todos pelo topo / pela esquerda.
  type ItemSelecionado = { id: string; nome: string; x: number; y: number; w: number; h: number; mover: (x: number, y: number) => void };
  const itensDaSelecao: ItemSelecionado[] =
    selectionCount > 1
      ? [
          ...selectedKeys.map((key) => {
            const cfg = layout[key] as { x?: number; y?: number } | undefined;
            return {
              id: key,
              nome: CARD_FIELD_DEFS.find((d) => d.key === key)?.label ?? key,
              x: cfg?.x ?? 0,
              y: cfg?.y ?? 0,
              ...tamanhoDoElemento(layout[key] ?? {}),
              mover: (x: number, y: number) => onUpdateField(key, { x, y }),
            };
          }),
          ...selectedShapeIds.map((id) => {
            const forma = shapes.find((f) => f.id === id);
            if (forma) {
              const rotulo = CARD_SHAPE_TYPES.find((t) => t.value === forma.type)?.label ?? forma.type;
              return {
                id,
                nome: `${rotulo} ${shapes.indexOf(forma) + 1}`,
                x: forma.x,
                y: forma.y,
                w: forma.w,
                h: forma.h,
                mover: (x: number, y: number) => onUpdateShape(id, { x, y }),
              };
            }
            const cfg = layout[chaveTexto(id)] as { x?: number; y?: number } | undefined;
            return {
              id,
              nome: `Texto ${listarTextos(layout).findIndex((t) => t.id === id) + 1}`,
              x: cfg?.x ?? 0,
              y: cfg?.y ?? 0,
              ...tamanhoDoElemento(layout[chaveTexto(id)] ?? {}),
              mover: (x: number, y: number) => onUpdateTexto(id, { x, y }),
            };
          }),
        ]
      : [];
  // Na ordem da seleção (o último = referência do "Centralizar").
  const itensSelecionados = [...itensDaSelecao].sort((a, b) => ordemSelecao.indexOf(a.id) - ordemSelecao.indexOf(b.id));
  const referencia = itensSelecionados[itensSelecionados.length - 1];
  const caixaX = itensSelecionados.length ? Math.min(...itensSelecionados.map((i) => i.x)) : 0;
  const caixaY = itensSelecionados.length ? Math.min(...itensSelecionados.map((i) => i.y)) : 0;
  // Move todos juntos pro canto (x, y) da seleção, mantendo as distâncias entre eles.
  function moverSelecao(novoX: number, novoY: number) {
    const dx = novoX - caixaX;
    const dy = novoY - caixaY;
    for (const it of itensSelecionados) it.mover(it.x + dx, it.y + dy);
  }
  function alinharPeloTopo() {
    for (const it of itensSelecionados) it.mover(it.x, caixaY);
  }
  function alinharPelaEsquerda() {
    for (const it of itensSelecionados) it.mover(caixaX, it.y);
  }
  // Centralizar: o CENTRO de cada elemento vai pro centro do último selecionado
  // (a referência). "Verticalmente" = mesma linha do meio (muda o Y);
  // "horizontalmente" = mesma coluna do meio (muda o X).
  function centralizarVerticalmente() {
    const centro = referencia.y + referencia.h / 2;
    for (const it of itensSelecionados) it.mover(it.x, Math.round(centro - it.h / 2));
  }
  function centralizarHorizontalmente() {
    const centro = referencia.x + referencia.w / 2;
    for (const it of itensSelecionados) it.mover(Math.round(centro - it.w / 2), it.y);
  }

  return (
    <PanelCard
      titulo="Elemento selecionado"
      destaque={selectionCount >= 1}
      acao={selectionCount >= 1 ? <UnitToggle unit={unit} onChange={onUnitChange} /> : undefined}
    >
      {selectionCount === 0 && (
        <Secao>
          <p className="text-xs text-slate-400">Clique num campo ou forma (na lista ao lado ou no canvas) pra editar.</p>
        </Secao>
      )}

      {selectionCount > 1 && (
        <Secao>
          <p className="text-xs text-slate-500">
            {selectionCount} elementos selecionados. Arraste ou use as setas do teclado pra mover todos juntos (Shift+seta move 10px).
          </p>
        </Secao>
      )}

      {selectionCount >= 1 && <BarraDeAcoes acoes={acoes} />}

      {selectionCount > 1 && (
        <>
          <Secao titulo="Posição da seleção">
            <div className="flex flex-col gap-2">
              <NumberField
                label={`Posição X (${unit})`}
                value={toDisplay(caixaX)}
                onCommit={(v) => moverSelecao(fromDisplay(v), caixaY)}
              />
              <NumberField
                label={`Posição Y (${unit})`}
                value={toDisplay(caixaY)}
                onCommit={(v) => moverSelecao(caixaX, fromDisplay(v))}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Canto superior esquerdo da seleção — move todos juntos, mantendo a distância entre eles.</p>
          </Secao>

          <Secao titulo="Alinhar">
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={alinharPeloTopo}
                title="Todos na mesma altura (Y igual ao do elemento mais alto)"
                className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Pelo topo
              </button>
              <button
                onClick={alinharPelaEsquerda}
                title="Todos na mesma posição horizontal (X igual ao do elemento mais à esquerda)"
                className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Pela esquerda
              </button>
              <button
                onClick={centralizarVerticalmente}
                title="Centro de cada elemento na mesma linha do meio do ÚLTIMO elemento selecionado (muda só o Y)"
                className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Centralizar verticalmente
              </button>
              <button
                onClick={centralizarHorizontalmente}
                title="Centro de cada elemento na mesma coluna do meio do ÚLTIMO elemento selecionado (muda só o X)"
                className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Centralizar horizontalmente
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Centralizar usa o último elemento selecionado como referência
              {referencia ? <> (agora: <strong>{referencia.nome}</strong>)</> : null}.
            </p>
          </Secao>

          <Secao titulo="Cada elemento">
            <div className="grid grid-cols-[1fr_4.2rem_4.2rem] items-center gap-x-2 gap-y-1.5">
              <span className="text-[10px] font-semibold uppercase text-slate-400">Elemento</span>
              <span className="text-[10px] font-semibold uppercase text-slate-400">X ({unit})</span>
              <span className="text-[10px] font-semibold uppercase text-slate-400">Y ({unit})</span>
              {itensSelecionados.map((it) => (
                <PosicaoDoElemento
                  key={it.id}
                  nome={it.nome}
                  x={toDisplay(it.x)}
                  y={toDisplay(it.y)}
                  onCommit={(nx, ny) => it.mover(fromDisplay(nx), fromDisplay(ny))}
                />
              ))}
            </div>
          </Secao>
        </>
      )}

      {selectionCount === 1 && selectedTextoId && (
        <TextProperties
          label="Texto"
          livre
          ehPreco={false}
          cfg={layout[chaveTexto(selectedTextoId)] as CardTextElementConfig}
          unit={unit}
          toDisplay={toDisplay}
          fromDisplay={fromDisplay}
          onUpdate={(patch) => onUpdateTexto(selectedTextoId, patch)}
        />
      )}

      {selectionCount === 1 && selectedShape && (
        <ShapeProperties
          shape={selectedShape}
          unit={unit}
          toDisplay={toDisplay}
          fromDisplay={fromDisplay}
          onUpdate={(patch) => onUpdateShape(selectedShape.id, patch)}
          onRemove={() => onRemoveShape(selectedShape.id)}
        />
      )}

      {selectionCount === 1 && selectedDef && selectedDef.type === "image" && (
        <>
          <Secao>
            <p className="text-sm font-semibold text-slate-900">{selectedDef.label}</p>
          </Secao>
          <Secao titulo="Fundo da foto">
            <FundoFields
              fundo={(layout[selectedDef.key] as CardImageElementConfig).fundo}
              rotulo="Cor de fundo atrás da foto"
              onChange={(fundo) => onUpdateField(selectedDef.key, { fundo })}
            />
            <p className="mt-1 text-[11px] text-slate-400">Útil para fotos PNG sem fundo.</p>
          </Secao>
          <Secao titulo="Cantos">
            <NumberField
              label={`Arredondar cantos (${unit})`}
              value={toDisplay((layout[selectedDef.key] as CardImageElementConfig).raio ?? 0)}
              onCommit={(v) => onUpdateField(selectedDef.key, { raio: Math.max(0, fromDisplay(v)) })}
            />
            <p className="mt-1 text-[11px] text-slate-400">Arredonda o fundo e recorta a própria foto.</p>
          </Secao>
          <Secao titulo="Posição e tamanho">
            <div className="flex flex-col gap-2">
              <NumberField
                label={`Posição X (${unit})`}
                value={toDisplay((layout[selectedDef.key] as CardImageElementConfig).x)}
                onCommit={(v) => onUpdateField(selectedDef.key, { x: fromDisplay(v) })}
              />
              <NumberField
                label={`Posição Y (${unit})`}
                value={toDisplay((layout[selectedDef.key] as CardImageElementConfig).y)}
                onCommit={(v) => onUpdateField(selectedDef.key, { y: fromDisplay(v) })}
              />
              <NumberField
                label={`Largura (${unit})`}
                value={toDisplay((layout[selectedDef.key] as CardImageElementConfig).w)}
                onCommit={(v) => onUpdateField(selectedDef.key, { w: Math.max(20, fromDisplay(v)) })}
              />
              <NumberField
                label={`Altura (${unit})`}
                value={toDisplay((layout[selectedDef.key] as CardImageElementConfig).h)}
                onCommit={(v) => onUpdateField(selectedDef.key, { h: Math.max(20, fromDisplay(v)) })}
              />
            </div>
          </Secao>
        </>
      )}

      {selectionCount === 1 && selectedDef && selectedDef.type === "text" && (
        <TextProperties
          label={selectedDef.label}
          ehPreco={selectedDef.key === "preco_1" || selectedDef.key === "preco_2"}
          cfg={layout[selectedDef.key] as CardTextElementConfig}
          unit={unit}
          toDisplay={toDisplay}
          fromDisplay={fromDisplay}
          onUpdate={(patch) => onUpdateField(selectedDef.key, patch)}
        />
      )}
    </PanelCard>
  );
}

function ShapeProperties({
  shape,
  unit,
  toDisplay,
  fromDisplay,
  onUpdate,
  onRemove,
}: {
  shape: CardShape;
  unit: "px" | "mm";
  toDisplay: (px: number) => number;
  fromDisplay: (v: number) => number;
  onUpdate: (patch: Partial<CardShape>) => void;
  onRemove: () => void;
}) {
  const label = CARD_SHAPE_TYPES.find((t) => t.value === shape.type)?.label ?? shape.type;
  return (
    <>
      <Secao>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <button onClick={onRemove} className="text-xs font-medium text-red-600 hover:text-red-800">
            Excluir
          </button>
        </div>
      </Secao>

      <Secao titulo="Posição e tamanho">
        <div className="flex flex-col gap-2">
          <NumberField label={`Posição X (${unit})`} value={toDisplay(shape.x)} onCommit={(v) => onUpdate({ x: fromDisplay(v) })} />
          <NumberField label={`Posição Y (${unit})`} value={toDisplay(shape.y)} onCommit={(v) => onUpdate({ y: fromDisplay(v) })} />
          <NumberField
            label={`Largura (${unit})`}
            value={toDisplay(shape.w)}
            onCommit={(v) => onUpdate({ w: Math.max(4, fromDisplay(v)) })}
          />
          <NumberField
            label={`Altura (${unit})`}
            value={toDisplay(shape.h)}
            onCommit={(v) => onUpdate({ h: Math.max(4, fromDisplay(v)) })}
          />
          {/* Arredondar cantos: só faz sentido em retângulo e triângulo (a
              elipse já é redonda). 0 = cantos retos; acima do que cabe na
              forma, é limitado automaticamente (metade do menor lado no
              retângulo). */}
          {shape.type !== "elipse" && (
            <NumberField
              label={`Arredondar cantos (${unit})`}
              value={toDisplay(shape.raio ?? 0)}
              onCommit={(v) => onUpdate({ raio: Math.max(0, fromDisplay(v)) })}
            />
          )}
        </div>
      </Secao>

      <Secao titulo="Aparência">
        <div className="flex flex-col gap-3">
          <ColorField label="Cor" value={shape.color} onChange={(color) => onUpdate({ color })} />
          <OpacityField value={shape.opacity} onChange={(opacity) => onUpdate({ opacity })} />
        </div>
      </Secao>
    </>
  );
}

function TextProperties({
  label,
  livre = false,
  ehPreco,
  cfg,
  unit,
  toDisplay,
  fromDisplay,
  onUpdate,
}: {
  label: string;
  // Texto livre (adicionado à mão): conteúdo fixo, igual em todos os cards.
  livre?: boolean;
  ehPreco: boolean;
  cfg: CardTextElementConfig;
  unit: "px" | "mm";
  toDisplay: (px: number) => number;
  fromDisplay: (v: number) => number;
  onUpdate: (patch: Partial<CardTextElementConfig>) => void;
}) {
  const botao = (ativo: boolean) =>
    "rounded-md px-2 py-1 text-xs font-medium " + (ativo ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200");
  return (
    <>
      <Secao>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
      </Secao>

      <Secao titulo="Conteúdo">
        <label className="text-xs text-slate-500">Texto</label>
        <input
          key={cfg.text}
          defaultValue={cfg.text}
          onBlur={(e) => onUpdate({ text: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        {livre ? (
          <p className="mt-1 text-[11px] text-slate-400">Texto fixo — o mesmo em todos os cards (ex.: rótulos como &quot;Oferta destaque&quot;).</p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400">
            O valor real do produto entra em <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">{"{valor}"}</code> — pode
            adicionar um rótulo fixo em volta, ex.: <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">À vista: {"{valor}"}</code>.
          </p>
        )}
      </Secao>

      <Secao titulo="Fonte">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-500">Fonte</label>
            <FontPicker
              family={cfg.fontFamily ?? DEFAULT_FONT_FAMILY}
              weight={cfg.fontWeight === "bold" ? 700 : 400}
              onSelect={(fam, w) => onUpdate({ fontFamily: fam, fontWeight: w === 700 ? "bold" : "normal" })}
            />
          </div>
          <NumberField label="Tamanho da fonte (px)" value={cfg.fontSize} onCommit={(v) => onUpdate({ fontSize: Math.max(8, v) })} />
          <div>
            <label className="text-xs text-slate-500">Peso da fonte</label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button onClick={() => onUpdate({ fontWeight: "normal" })} className={botao(cfg.fontWeight === "normal")}>
                Normal
              </button>
              <button onClick={() => onUpdate({ fontWeight: "bold" })} className={botao(cfg.fontWeight === "bold")}>
                Negrito
              </button>
            </div>
          </div>
          <ColorField label="Cor" value={cfg.color} onChange={(color) => onUpdate({ color })} />
        </div>
      </Secao>

      {ehPreco && (
        <Secao titulo="Estilo do preço">
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => onUpdate({ precoEstilo: "normal" })} className={botao(cfg.precoEstilo !== "destacado")}>
              Normal
            </button>
            <button onClick={() => onUpdate({ precoEstilo: "destacado" })} className={botao(cfg.precoEstilo === "destacado")}>
              Centavos pequenos
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            O valor inteiro fica grande (é o &quot;Tamanho da fonte&quot;) e o R$ e os centavos saem menores, alinhados pelo topo. Um rótulo no texto,
            como &quot;Preço SP: {"{valor}"}&quot;, também sai pequeno.
          </p>
        </Secao>
      )}

      <Secao titulo="Posição e caixa">
        <div className="flex flex-col gap-3">
          <NumberField label={`Posição X (${unit})`} value={toDisplay(cfg.x)} onCommit={(v) => onUpdate({ x: fromDisplay(v) })} />
          <NumberField label={`Posição Y (${unit})`} value={toDisplay(cfg.y)} onCommit={(v) => onUpdate({ y: fromDisplay(v) })} />
          <NumberField
            label={`Largura máxima (${unit})`}
            value={toDisplay(cfg.maxW)}
            onCommit={(v) => onUpdate({ maxW: Math.max(40, fromDisplay(v)) })}
          />
          <div>
            <NumberField
              label={`Altura da caixa (${unit})`}
              value={toDisplay(alturaCaixaTexto(cfg))}
              onCommit={(v) => onUpdate({ h: Math.max(4, fromDisplay(v)) })}
            />
            <div className="mt-1 flex items-center gap-1">
              <button
                onClick={() => onUpdate({ h: Math.ceil(cfg.fontSize * 1.2) })}
                title="Caixa do tamanho de uma linha de texto"
                className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200"
              >
                Ajustar a 1 linha
              </button>
              <button
                onClick={() => onUpdate({ h: undefined })}
                disabled={!cfg.h}
                title={`Volta ao automático (${alturaAutomaticaTexto(cfg)} px: linhas x fonte)`}
                className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Automática
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Só muda a caixa de seleção e a referência pra alinhar/centralizar; o texto continua saindo do topo da caixa. Também dá pra arrastar as alças de cima e de baixo no canvas.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500">Número de linhas</label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => onUpdate({ maxLines: n })} className={"flex-1 " + botao(cfg.maxLines === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Alinhamento</label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {ALIGN_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => onUpdate({ align: opt.value })} className={botao(cfg.align === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Secao>
    </>
  );
}
