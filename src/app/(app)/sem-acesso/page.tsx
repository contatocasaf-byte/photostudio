import AcessoNegado from "@/components/AcessoNegado";

// Destino pós-login (Fase 6) pra uma conta sem nenhuma permissão
// marcada ainda — nunca deveria acontecer com o trigger
// `on_auth_user_created` mais um Supervisor/Administrador liberando
// acesso rápido, mas evita cair num 404 se acontecer.
export default function SemAcessoPage() {
  return <AcessoNegado />;
}
