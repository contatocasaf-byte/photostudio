import PermissaoGate from "@/components/PermissaoGate";
import { getCatalog, getSection } from "../../../actions";
import { permissaoParaAcao } from "../../../core/permissoes";
import CardEditorClient from "./CardEditorClient";

export default async function CardEditorPage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { sectionId } = await params;
  // Card-molde é a MESMA tela pra Catálogo e Jornal de Ofertas — a
  // permissão certa depende do tipo do catálogo dono desta seção (ver
  // permissaoParaAcao), por isso o lookup section -> catálogo aqui.
  const sectionRes = await getSection(sectionId);
  const catalogRes = sectionRes.section ? await getCatalog(sectionRes.section.catalog_id) : null;
  const tipo = catalogRes?.catalog?.tipo ?? "catalogo";

  return (
    <PermissaoGate chave={permissaoParaAcao(tipo, "card_molde")}>
      <CardEditorClient params={params} />
    </PermissaoGate>
  );
}
