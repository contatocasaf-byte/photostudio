import PermissaoGate from "@/components/PermissaoGate";
import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import CatalogDetailClient from "./CatalogDetailClient";

export default async function CatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // getCurrentAccess() já é cache()ado (React) — chamar de novo aqui
  // não bate no banco outra vez, o PermissaoGate abaixo reaproveita o
  // mesmo resultado dentro da mesma requisição.
  const access = await getCurrentAccess();
  const podeExcluirPlanilhas = temPermissao(access, "catalogos_excluir_planilhas");
  const podeAtualizarPlanilhas = temPermissao(access, "catalogos_atualizar_planilhas");

  return (
    <PermissaoGate chave="catalogos_gerenciar">
      <CatalogDetailClient params={params} podeExcluirPlanilhas={podeExcluirPlanilhas} podeAtualizarPlanilhas={podeAtualizarPlanilhas} />
    </PermissaoGate>
  );
}
