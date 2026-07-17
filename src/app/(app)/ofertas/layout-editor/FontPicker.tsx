"use client";

import { useEffect, useMemo, useState } from "react";
import { listGoogleFontOptions, listCustomFontOptions, ensureFontLoaded, type FontOption } from "../fonts/fontLoader";

type FamilyEntry = { family: string; weights: number[]; source: "google" | "custom" };

function groupByFamily(options: FontOption[]): FamilyEntry[] {
  const map = new Map<string, FamilyEntry>();
  for (const o of options) {
    const existing = map.get(o.family);
    if (existing) {
      if (!existing.weights.includes(o.weight)) existing.weights.push(o.weight);
    } else {
      map.set(o.family, { family: o.family, weights: [o.weight], source: o.source });
    }
  }
  return [...map.values()].sort((a, b) => a.family.localeCompare(b.family));
}

type Props = {
  family: string;
  weight: number; // peso atualmente selecionado (400 ou 700) — decide se troca ao selecionar outra família
  onSelect: (family: string, weight: number) => void;
};

// Seletor de fonte com busca, cada nome de família renderizado NA
// PRÓPRIA fonte — mesma UX do font_picker.py original, combinando as
// Google Fonts curadas com as fontes próprias enviadas pelo usuário
// (ver ofertas/fonts/).
export default function FontPicker({ family, weight, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [families, setFamilies] = useState<FamilyEntry[] | null>(null);

  useEffect(() => {
    if (!open || families) return;
    let cancelled = false;
    Promise.all([Promise.resolve(listGoogleFontOptions()), listCustomFontOptions()]).then(([google, custom]) => {
      if (cancelled) return;
      const grouped = groupByFamily([...google, ...custom]);
      setFamilies(grouped);
      // Pré-carrega o peso mais leve de cada família só pra já exibir
      // o nome na fonte certa na lista — lista é pequena o bastante
      // pra não pesar (dezenas de famílias, não centenas).
      grouped.forEach((f) => {
        ensureFontLoaded(f.family, f.weights[0]).catch(() => {});
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, families]);

  const filtered = useMemo(() => {
    if (!families) return [];
    const q = query.trim().toLowerCase();
    if (!q) return families;
    return families.filter((f) => f.family.toLowerCase().includes(q));
  }, [families, query]);

  function pick(f: FamilyEntry) {
    const nextWeight = f.weights.includes(weight) ? weight : f.weights[0];
    onSelect(f.family, nextWeight);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 w-full truncate rounded-md border border-slate-300 px-2 py-1.5 text-left text-sm"
        style={{ fontFamily: `"${family}", Arial, sans-serif` }}
      >
        {family}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fonte..."
              className="w-full border-b border-slate-200 px-2 py-1.5 text-sm outline-none"
            />
            <div className="max-h-60 overflow-y-auto py-1">
              {!families && <p className="px-2 py-2 text-xs text-slate-400">Carregando fontes...</p>}
              {families && filtered.length === 0 && (
                <p className="px-2 py-2 text-xs text-slate-400">Nenhuma fonte encontrada.</p>
              )}
              {filtered.map((f) => (
                <button
                  key={f.family}
                  type="button"
                  onClick={() => pick(f)}
                  className={
                    "flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-slate-50 " +
                    (f.family === family ? "bg-slate-100" : "")
                  }
                  style={{ fontFamily: `"${f.family}", Arial, sans-serif` }}
                >
                  <span className="truncate">{f.family}</span>
                  {f.source === "custom" && (
                    <span className="ml-2 shrink-0 text-[10px] font-sans normal-case text-slate-400">própria</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
