"use client";

import { useState } from "react";
import GenerateOfferForm from "./GenerateOfferForm";
import LayoutEditor from "./layout-editor/LayoutEditor";
import BatchGenerateForm from "./batch/BatchGenerateForm";

const ALL_TABS = [
  { id: "gerar", label: "Gerar Oferta" },
  { id: "lote", label: "Gerar em Lote" },
  { id: "layout", label: "Editor de Layout" },
] as const;

type Tab = (typeof ALL_TABS)[number]["id"];

export type OfertasAcessos = Record<Tab, boolean>;

export default function OfertasClient({ acessos }: { acessos: OfertasAcessos }) {
  const tabs = ALL_TABS.filter((t) => acessos[t.id]);
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "gerar");

  return (
    <div className={tab !== "gerar" ? "max-w-5xl" : "max-w-3xl"}>
      <h1 className="text-lg font-semibold text-slate-900">Gerador de Ofertas</h1>
      <p className="mt-1 text-sm text-slate-500">
        Layout + foto do produto + preços, individual ou em lote, tudo gerado no navegador. Biblioteca de fontes
        chega numa próxima entrega.
      </p>

      <div className="mt-4 flex gap-2 border-b border-slate-200">
        {tabs.map((t) => (
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
        {tab === "gerar" && acessos.gerar && <GenerateOfferForm />}
        {tab === "lote" && acessos.lote && <BatchGenerateForm />}
        {tab === "layout" && acessos.layout && <LayoutEditor />}
      </div>
    </div>
  );
}
