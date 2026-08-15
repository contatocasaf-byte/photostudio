import PermissaoGate from "@/components/PermissaoGate";
import { getCatalog, getSection } from "../../../../actions";
import { permissaoParaAcao } from "../../../../core/permissoes";
import ProdutosSecaoClient from "./ProdutosSecaoClient";

export default async function SectionProdutosPage({ params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { sectionId } = await params;
  // Mesma tela pra Catálogo e Jornal de Ofertas — permissão certa
  // depende do tipo do catálogo dono desta seção (ver permissaoParaAcao).
  const sectionRes = await getSection(sectionId);
  const catalogRes = sectionRes.section ? await getCatalog(sectionRes.section.catalog_id) : null;
  const tipo = catalogRes?.catalog?.tipo ?? "catalogo";

  return (
    <PermissaoGate chave={permissaoParaAcao(tipo, "produtos_secao")}>
      <ProdutosSecaoClient params={params} />
    </PermissaoGate>
  );
}
