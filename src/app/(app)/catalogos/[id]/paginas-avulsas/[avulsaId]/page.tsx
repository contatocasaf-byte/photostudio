import PermissaoGate from "@/components/PermissaoGate";
import PaginaAvulsaClient from "./PaginaAvulsaClient";

export default function PaginaAvulsaEditorPage({ params }: { params: Promise<{ id: string; avulsaId: string }> }) {
  return (
    <PermissaoGate chave="catalogos_modelos_pagina">
      <PaginaAvulsaClient params={params} />
    </PermissaoGate>
  );
}
