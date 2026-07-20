import { getCurrentAccess, temPermissao } from "@/lib/auth/access";
import type { PermissaoChave } from "@/lib/auth/permissoes";
import AcessoNegado from "./AcessoNegado";

// Wrapper genérico (Fase 6) pras 10 rotas de Catálogos — cada page.tsx
// vira um Server Component fino que só checa 1 permissão e renderiza
// o Client Component original (agora *Client.tsx) por dentro, ou
// AcessoNegado se faltar a permissão. Evita repetir a mesma checagem
// (getCurrentAccess + temPermissao + AcessoNegado) em 10 arquivos.
export default async function PermissaoGate({ chave, children }: { chave: PermissaoChave; children: React.ReactNode }) {
  const access = await getCurrentAccess();
  if (!temPermissao(access, chave)) return <AcessoNegado />;
  return <>{children}</>;
}
