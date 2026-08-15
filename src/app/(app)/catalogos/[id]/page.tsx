import PermissaoGate from "@/components/PermissaoGate";
import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import { permissoesDoModulo } from "@/lib/auth/permissoes";
import { getCatalog } from "../actions";
import { permissaoParaAcao } from "../core/permissoes";
import CatalogDetailClient from "./CatalogDetailClient";

export default async function CatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // getCurrentAccess() já é cache()ado (React) — chamar de novo aqui
  // não bate no banco outra vez, o PermissaoGate abaixo reaproveita o
  // mesmo resultado dentro da mesma requisição.
  const access = await getCurrentAccess();
  const { id } = await params;
  // Mesma tela pra Catálogo e Jornal de Ofertas — a permissão certa
  // depende do tipo deste catálogo (ver permissaoParaAcao).
  const catalogRes = await getCatalog(id);
  const tipo = catalogRes.catalog?.tipo ?? "catalogo";

  const podeExcluirPlanilhas = temPermissao(access, "catalogos_excluir_planilhas");
  const podeAtualizarPlanilhas = temPermissao(access, "catalogos_atualizar_planilhas");
  const podeEditarCatalogo = temPermissao(access, permissaoParaAcao(tipo, "editar"));
  const podeCriarSecoes = temPermissao(access, permissaoParaAcao(tipo, "criar_secoes"));
  const podeEditarSecoes = temPermissao(access, permissaoParaAcao(tipo, "editar_secoes"));
  const podeExcluirSecoes = temPermissao(access, permissaoParaAcao(tipo, "excluir_secoes"));

  return (
    <PermissaoGate chave={permissoesDoModulo("catalogos").map((p) => p.chave)}>
      <CatalogDetailClient
        params={params}
        podeExcluirPlanilhas={podeExcluirPlanilhas}
        podeAtualizarPlanilhas={podeAtualizarPlanilhas}
        podeEditarCatalogo={podeEditarCatalogo}
        podeCriarSecoes={podeCriarSecoes}
        podeEditarSecoes={podeEditarSecoes}
        podeExcluirSecoes={podeExcluirSecoes}
      />
    </PermissaoGate>
  );
}
