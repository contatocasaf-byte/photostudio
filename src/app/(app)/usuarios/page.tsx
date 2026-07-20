import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import AcessoNegado from "@/components/AcessoNegado";
import UsuariosListClient from "./UsuariosListClient";

export default async function UsuariosPage() {
  const access = await getCurrentAccess();
  if (!access || (!access.isAdmin && !temPermissao(access, "criar_usuarios"))) {
    return <AcessoNegado />;
  }
  return <UsuariosListClient isAdmin={access.isAdmin} currentUserId={access.userId} />;
}
