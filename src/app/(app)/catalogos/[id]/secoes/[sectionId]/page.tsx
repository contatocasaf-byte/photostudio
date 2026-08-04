import PermissaoGate from "@/components/PermissaoGate";
import CardEditorClient from "./CardEditorClient";

export default function CardEditorPage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  return (
    <PermissaoGate chave="catalogos_card_molde">
      <CardEditorClient params={params} />
    </PermissaoGate>
  );
}
