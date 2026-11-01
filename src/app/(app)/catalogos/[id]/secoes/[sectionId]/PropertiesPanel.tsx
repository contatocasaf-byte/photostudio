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

function Secao({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section className="py-3">
      {titulo && <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3>}
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
  // "Estrutura do card" é um item da lista, como os campos: selecionada
  // quando não há campo/forma selecionado.
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
  estruturaSelecionada,
  onSelectEstrutura,
}: ElementsPanelProps) {
  const camposTexto = CARD_FIELD_DEFS.filter((d) => d.type === "text" && camposHabilitados.includes(d.key));

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
  // Unidade (px/mm) compartilhada com o painel de estrutura.
  unit: Unidade;
  onUnitChange: (u: Unidade) => void;
};

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
  unit,
  onUnitChange,
}: SelectedElementPanelProps) {
  const selectionCount = selectedKeys.length + selectedShapeIds.length;
  const selectedDef = selectedKeys.length === 1 ? CARD_FIELD_DEFS.find((d) => d.key === selectedKeys[0]) : null;
  const selectedShape = selectedShapeIds.length === 1 ? shapes.find((s) => s.id === selectedShapeIds[0]) : null;

  function toDisplay(px: number) {
    return unit === "mm" ? pxToMm(px) : Math.round(px);
  }
  function fromDisplay(v: number) {
    return unit === "mm" ? mmToPx(v) : Math.round(v);
  }

  return (
    <PanelCard
      titulo="Elemento selecionado"
      destaque={selectionCount === 1}
      acao={selectionCount === 1 ? <UnitToggle unit={unit} onChange={onUnitChange} /> : undefined}
    >
      {selectionCount === 0 && (
        <Secao>
          <p className="text-xs text-slate-400">Clique num campo ou forma (na lista ao lado ou no canvas) pra editar.</p>
        </Secao>
      )}

      {selectionCount > 1 && (
        <Secao>
          <p className="text-xs text-slate-500">
            {selectionCount} elementos selecionados. Use as setas do teclado pra mover todos juntos (Shift+seta move 10px).
          </p>
        </Secao>
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
  ehPreco,
  cfg,
  unit,
  toDisplay,
  fromDisplay,
  onUpdate,
}: {
  label: string;
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
        <p className="mt-1 text-[11px] text-slate-400">
          O valor real do produto entra em <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">{"{valor}"}</code> — pode
          adicionar um rótulo fixo em volta, ex.: <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5">À vista: {"{valor}"}</code>.
        </p>
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
