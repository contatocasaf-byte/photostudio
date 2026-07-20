import PermissaoGate from "@/components/PermissaoGate";
import PageEditorClient from "./PageEditorClient";

export default function PageEditorPage({ params }: { params: Promise<{ id: string; tipo: string }> }) {
  return (
    <PermissaoGate chave="catalogos_modelos_pagina">
      <PageEditorClient params={params} />
    </PermissaoGate>
  );
}
