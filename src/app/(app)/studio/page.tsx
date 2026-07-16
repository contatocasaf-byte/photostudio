"use client";

import { useState } from "react";
import BatchUpload from "./BatchUpload";
import WatermarkTool from "./WatermarkTool";
import RenamerTool from "./RenamerTool";
import FolderCompareTool from "./FolderCompareTool";

const TABS = [
  { id: "lote", label: "Editor" },
  { id: "marca", label: "Marca d'água" },
  { id: "renomear", label: "Renomeador" },
  { id: "comparar", label: "Comparador de Pastas" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>("lote");
  // Handoff do Comparador de Pastas pro Aplicador de Marca: fotos
  // pendentes resolvidas (getFile já chamado) esperando serem
  // adicionadas assim que a aba Marca d'água montar.
  const [incomingMarcaFiles, setIncomingMarcaFiles] = useState<File[] | undefined>(undefined);

  return (
    <div className={tab === "renomear" ? "max-w-5xl" : "max-w-3xl"}>
      <h1 className="text-lg font-semibold text-slate-900">Studio de Produtos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Remoção de fundo, editor, aplicador de marca d&apos;água, renomeador e comparador de pastas.
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
        {tab === "marca" && (
          <WatermarkTool incomingFiles={incomingMarcaFiles} onConsumedIncoming={() => setIncomingMarcaFiles(undefined)} />
        )}
        {tab === "renomear" && <RenamerTool />}
        {tab === "comparar" && (
          <FolderCompareTool
            onApplyMarca={(files) => {
              setIncomingMarcaFiles(files);
              setTab("marca");
            }}
          />
        )}
      </div>
    </div>
  );
}
