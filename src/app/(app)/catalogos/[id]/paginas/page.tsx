import PermissaoGate from "@/components/PermissaoGate";
import PaginasClient from "./PaginasClient";

export default function PaginasPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PermissaoGate chave="catalogos_modelos_pagina">
      <PaginasClient params={params} />
    </PermissaoGate>
  );
}
