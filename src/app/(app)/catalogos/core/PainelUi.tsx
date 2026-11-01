// Peças visuais dos painéis de propriedades dos editores (card-molde e modelos
// de página): cartão com título, seção com subtítulo, campos numérico, de cor e
// de transparência, e o seletor de unidade. Antes cada painel tinha a sua cópia.
import type { ReactNode } from "react";

export type Unidade = "px" | "mm";

export function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
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

// Campo de cor (seletor + código hexadecimal).
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (cor: string) => void }) {
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

export function OpacityField({ value, onChange }: { value: number; onChange: (opacidade: number) => void }) {
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

export function UnitToggle({ unit, onChange }: { unit: Unidade; onChange: (u: Unidade) => void }) {
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

// Cada painel é um CARTÃO com título e seções separadas por linha. `destaque`
// pinta o cartão do elemento selecionado.
export function PanelCard({
  titulo,
  acao,
  destaque,
  children,
}: {
  titulo: string;
  acao?: ReactNode;
  destaque?: boolean;
  children: ReactNode;
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

// `acao` = botão à direita do subtítulo (ex.: "+ Ilustração").
export function Secao({ titulo, acao, children }: { titulo?: string; acao?: ReactNode; children: ReactNode }) {
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
