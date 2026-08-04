import PermissaoGate from "@/components/PermissaoGate";
import ProdutosSecaoClient from "./ProdutosSecaoClient";

export default function SectionProdutosPage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  return (
    <PermissaoGate chave="catalogos_produtos_secao">
      <ProdutosSecaoClient params={params} />
    </PermissaoGate>
  );
}
