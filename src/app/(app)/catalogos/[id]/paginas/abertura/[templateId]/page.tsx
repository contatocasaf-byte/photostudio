import PermissaoGate from "@/components/PermissaoGate";
import AberturaSecaoClient from "./AberturaSecaoClient";

export default function AberturaSecaoEditorPage({ params }: { params: Promise<{ id: string; templateId: string }> }) {
  return (
    <PermissaoGate chave="catalogos_modelos_pagina">
      <AberturaSecaoClient params={params} />
    </PermissaoGate>
  );
}
