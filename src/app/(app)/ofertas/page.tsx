"use client";

import { useState } from "react";
import GenerateOfferForm from "./GenerateOfferForm";
import LayoutEditor from "./layout-editor/LayoutEditor";

const TABS = [
  { id: "gerar", label: "Gerar Oferta" },
  { id: "layout", label: "Editor de Layout" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function OfertasPage() {
  const [tab, setTab] = useState<Tab>("gerar");

  return (
    <div className={tab === "layout" ? "max-w-5xl" : "max-w-3xl"}>
      <h1 className="text-lg font-semibold text-slate-900">Gerador de Ofertas</h1>
      <p className="mt-1 text-sm text-slate-500">
        Modo individual — layout + foto do produto + preços, tudo gerado no navegador. Biblioteca de fontes e modo em
        lote chegam numa próxima entrega.
      </p>

      <div className="mt-4 flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "border-b-2 px-3 py-2 text-sm font-medium " +
              (tab === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "gerar" && <GenerateOfferForm />}
        {tab === "layout" && <LayoutEditor />}
      </div>
    </div>
  );
}
