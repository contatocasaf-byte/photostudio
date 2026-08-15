import PermissaoGate from "@/components/PermissaoGate";
import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import { permissoesDoModulo } from "@/lib/auth/permissoes";
import { permissaoParaAcao } from "../core/permissoes";
import CatalogosClient from "../CatalogosClient";

export default async function JornaisDeOfertasPage() {
  const access = await getCurrentAccess();
  const podeCriarCatalogos = temPermissao(access, permissaoParaAcao("jornal_ofertas", "criar"));
  const podeExcluirCatalogos = temPermissao(access, permissaoParaAcao("jornal_ofertas", "excluir"));

  return (
    <PermissaoGate chave={permissoesDoModulo("catalogos").map((p) => p.chave)}>
      <CatalogosClient tipo="jornal_ofertas" podeCriarCatalogos={podeCriarCatalogos} podeExcluirCatalogos={podeExcluirCatalogos} />
    </PermissaoGate>
  );
}
