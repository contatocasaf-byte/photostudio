import PermissaoGate from "@/components/PermissaoGate";
import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import { permissoesDoModulo } from "@/lib/auth/permissoes";
import { permissaoParaAcao } from "./core/permissoes";
import CatalogosClient from "./CatalogosClient";

export default async function CatalogosPage() {
  const access = await getCurrentAccess();
  const podeCriarCatalogos = temPermissao(access, permissaoParaAcao("catalogo", "criar"));
  const podeExcluirCatalogos = temPermissao(access, permissaoParaAcao("catalogo", "excluir"));

  return (
    <PermissaoGate chave={permissoesDoModulo("catalogos").map((p) => p.chave)}>
      <CatalogosClient tipo="catalogo" podeCriarCatalogos={podeCriarCatalogos} podeExcluirCatalogos={podeExcluirCatalogos} />
    </PermissaoGate>
  );
}
