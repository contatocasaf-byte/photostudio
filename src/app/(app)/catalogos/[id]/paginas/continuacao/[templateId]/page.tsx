import PermissaoGate from "@/components/PermissaoGate";
import ContinuacaoClient from "./ContinuacaoClient";

export default function ContinuacaoEditorPage({ params }: { params: Promise<{ id: string; templateId: string }> }) {
  return (
    <PermissaoGate chave="catalogos_modelos_pagina">
      <ContinuacaoClient params={params} />
    </PermissaoGate>
  );
}
