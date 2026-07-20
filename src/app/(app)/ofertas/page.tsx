import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import AcessoNegado from "@/components/AcessoNegado";
import OfertasClient from "./OfertasClient";

export default async function OfertasPage() {
  const access = await getCurrentAccess();
  const acessos = {
    gerar: temPermissao(access, "ofertas_gerar"),
    lote: temPermissao(access, "ofertas_lote"),
    layout: temPermissao(access, "ofertas_layout"),
  };
  if (!Object.values(acessos).some(Boolean)) return <AcessoNegado />;
  return <OfertasClient acessos={acessos} />;
}
