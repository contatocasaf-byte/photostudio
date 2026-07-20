import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import AcessoNegado from "@/components/AcessoNegado";
import EditarUsuarioClient from "./EditarUsuarioClient";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getCurrentAccess();
  if (!access || (!access.isAdmin && !temPermissao(access, "criar_usuarios"))) {
    return <AcessoNegado />;
  }
  return <EditarUsuarioClient usuarioId={id} isAdmin={access.isAdmin} currentUserId={access.userId} />;
}
