import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { signVerifiedUser, VERIFIED_USER_HEADER, type VerifiedUser } from "../auth/verifiedUser";

const PUBLIC_ROUTES = ["/login"];

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] };

// Encaminha a requisição pra frente (página/Server Action/rota de API).
// O cabeçalho do usuário verificado é SEMPRE apagado do que veio do
// cliente e só reescrito aqui, depois de supabase.auth.getUser() ter
// validado a sessão — assim a renderização pode confiar nele (e ainda o
// verifica por assinatura, ver auth/verifiedUser.ts).
export async function forwardRequest(request: NextRequest, verified: VerifiedUser | null, cookiesToSet: CookieToSet[]) {
  const headers = new Headers(request.headers);
  headers.delete(VERIFIED_USER_HEADER);
  if (verified) {
    const signed = await signVerifiedUser(verified);
    if (signed) headers.set(VERIFIED_USER_HEADER, signed);
  }

  const response = NextResponse.next({ request: { headers } });
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export async function updateSession(request: NextRequest) {
  let cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          // Sessão renovada: a requisição que segue pra página já precisa
          // enxergar os cookies novos (request.cookies.set atualiza o
          // cabeçalho "cookie" copiado em forwardRequest), e o navegador
          // recebe os mesmos cookies na resposta.
          cookiesToSet = list;
          list.forEach(({ name, value }) => request.cookies.set(name, value));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some((route) => path.startsWith(route));

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/studio";
    return NextResponse.redirect(url);
  }

  return forwardRequest(request, user ? { id: user.id, email: user.email ?? "" } : null, cookiesToSet);
}
