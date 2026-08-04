import { getCurrentAccess, temAlgumaPermissao, temPermissao } from "@/lib/auth/access";
import type { PermissaoChave } from "@/lib/auth/permissoes";
import AcessoNegado from "./AcessoNegado";

// Wrapper genérico (Fase 6) pras rotas de Catálogos — cada page.tsx
// vira um Server Component fino que só checa a(s) permissão(ões) e
// renderiza o Client Component original (agora *Client.tsx) por
// dentro, ou AcessoNegado se faltar. Evita repetir a mesma checagem
// (getCurrentAccess + temPermissao + AcessoNegado) em vários arquivos.
//
// `chave` aceita um array desde a divisão de "Gerenciar catálogos" em
// 6 permissões — QUALQUER uma da lista libera (ex.: entrada no módulo
// Catálogos, liberada por qualquer uma das permissões do módulo).
export default async function PermissaoGate({
  chave,
  children,
}: {
  chave: PermissaoChave | PermissaoChave[];
  children: React.ReactNode;
}) {
  const access = await getCurrentAccess();
  const liberado = Array.isArray(chave) ? temAlgumaPermissao(access, chave) : temPermissao(access, chave);
  if (!liberado) return <AcessoNegado />;
  return <>{children}</>;
}
