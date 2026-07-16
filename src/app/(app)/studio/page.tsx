"use client";

import { useState } from "react";
import BatchUpload from "./BatchUpload";
import WatermarkTool from "./WatermarkTool";
import RenamerTool from "./RenamerTool";

const TABS = [
  { id: "lote", label: "Editor" },
  { id: "marca", label: "Marca d'água" },
  { id: "renomear", label: "Renomeador" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>("lote");

  return (
    <div className={tab === "renomear" ? "max-w-5xl" : "max-w-3xl"}>
      <h1 className="text-lg font-semibold text-slate-900">Studio de Produtos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Remoção de fundo, editor, aplicador de marca d&apos;água e renomeador. Comparador de pastas chega numa
        próxima entrega.
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
        {tab === "lote" && <BatchUpload />}
        {tab === "marca" && <WatermarkTool />}
        {tab === "renomear" && <RenamerTool />}
      </div>
    </div>
  );
}
