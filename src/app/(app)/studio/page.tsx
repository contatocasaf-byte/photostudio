import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import AcessoNegado from "@/components/AcessoNegado";
import StudioClient from "./StudioClient";

export default async function StudioPage() {
  const access = await getCurrentAccess();
  const acessos = {
    lote: temPermissao(access, "studio_editor"),
    marca: temPermissao(access, "studio_marca_dagua"),
    renomear: temPermissao(access, "studio_renomeador"),
    comparar: temPermissao(access, "studio_comparador"),
  };
  if (!Object.values(acessos).some(Boolean)) return <AcessoNegado />;
  return <StudioClient acessos={acessos} />;
}
