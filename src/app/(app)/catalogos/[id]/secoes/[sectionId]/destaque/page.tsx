import PermissaoGate from "@/components/PermissaoGate";
import { getCatalog, getSection } from "../../../../actions";
import { permissaoParaAcao } from "../../../../core/permissoes";
import CardEditorClient from "../CardEditorClient";

// Card-molde de DESTAQUE da seção — mesmo editor do card padrão, gravando na
// cadeia própria (card_templates_destaque). Mesma permissão do card-molde.
export default async function CardDestaquePage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { sectionId } = await params;
  const sectionRes = await getSection(sectionId);
  const catalogRes = sectionRes.section ? await getCatalog(sectionRes.section.catalog_id) : null;
  const tipo = catalogRes?.catalog?.tipo ?? "catalogo";

  return (
    <PermissaoGate chave={permissaoParaAcao(tipo, "card_molde")}>
      <CardEditorClient params={params} variante="destaque" />
    </PermissaoGate>
  );
}
