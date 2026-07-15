"use client";

import { useState } from "react";
import IndividualUpload from "./IndividualUpload";
import BatchUpload from "./BatchUpload";

export default function StudioPage() {
  const [tab, setTab] = useState<"individual" | "lote">("individual");

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-slate-900">Studio de Produtos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Remoção de fundo individual ou em lote. Editor, marca d&apos;água, renomeador
        e comparador chegam nas próximas entregas da Fase 2.
      </p>

      <div className="mt-4 flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab("individual")}
          className={
            "border-b-2 px-3 py-2 text-sm font-medium " +
            (tab === "individual" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500")
          }
        >
          Individual
        </button>
        <button
          onClick={() => setTab("lote")}
          className={
            "border-b-2 px-3 py-2 text-sm font-medium " +
            (tab === "lote" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500")
          }
        >
          Lote (até 50)
        </button>
      </div>

      <div className="mt-4">{tab === "individual" ? <IndividualUpload /> : <BatchUpload />}</div>
    </div>
  );
}
