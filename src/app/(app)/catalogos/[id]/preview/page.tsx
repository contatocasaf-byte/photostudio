import PermissaoGate from "@/components/PermissaoGate";
import PreviewClient from "./PreviewClient";

export default function CatalogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PermissaoGate chave="catalogos_preview_pdf">
      <PreviewClient params={params} />
    </PermissaoGate>
  );
}
