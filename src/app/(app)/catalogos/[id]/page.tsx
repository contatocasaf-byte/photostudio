import PermissaoGate from "@/components/PermissaoGate";
import CatalogDetailClient from "./CatalogDetailClient";

export default function CatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PermissaoGate chave="catalogos_gerenciar">
      <CatalogDetailClient params={params} />
    </PermissaoGate>
  );
}
