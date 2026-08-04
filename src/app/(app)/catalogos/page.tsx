import PermissaoGate from "@/components/PermissaoGate";
import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import { permissoesDoModulo } from "@/lib/auth/permissoes";
import CatalogosClient from "./CatalogosClient";

export default async function CatalogosPage() {
  const access = await getCurrentAccess();
  const podeCriarCatalogos = temPermissao(access, "catalogos_criar_catalogos");
  const podeExcluirCatalogos = temPermissao(access, "catalogos_excluir_catalogos");

  return (
    <PermissaoGate chave={permissoesDoModulo("catalogos").map((p) => p.chave)}>
      <CatalogosClient podeCriarCatalogos={podeCriarCatalogos} podeExcluirCatalogos={podeExcluirCatalogos} />
    </PermissaoGate>
  );
}
