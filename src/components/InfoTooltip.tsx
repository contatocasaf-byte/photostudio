"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  children: React.ReactNode;
};

// Botão "i" com balão explicativo — clique pra abrir/fechar (não só
// hover, pra funcionar em touch também), fecha ao clicar fora.
export default function InfoTooltip({ title, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Sobre: ${title}`}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-20 w-80 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-lg">
          <p className="mb-2 font-semibold text-slate-900">{title}</p>
          <div className="space-y-2">{children}</div>
        </div>
      )}
    </div>
  );
}
