import PermissaoGate from "@/components/PermissaoGate";
import CatalogosClient from "./CatalogosClient";

export default function CatalogosPage() {
  return (
    <PermissaoGate chave="catalogos_gerenciar">
      <CatalogosClient />
    </PermissaoGate>
  );
}
