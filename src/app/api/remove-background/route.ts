import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy server-side pro microserviço Python (FastAPI) — evita expor a URL
// do backend e configurar CORS nele para chamadas vindas do navegador.
//
// maxDuration alto de propósito: o backend no Render (tier grátis) "dorme"
// após inatividade e pode levar 30-60s pra acordar na primeira chamada —
// sem isso, a função da Vercel expira antes do Render responder e o
// navegador recebe uma resposta vazia (erro "Unexpected end of JSON
// input"). 60s é o máximo permitido no plano Hobby da Vercel.
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const { key } = await request.json();
  if (!key) {
    return NextResponse.json({ error: "Faltou a key da imagem." }, { status: 400 });
  }

  const res = await fetch(`${process.env.BACKEND_URL}/remove-background`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shared-secret": process.env.BACKEND_SHARED_SECRET ?? "",
    },
    body: JSON.stringify({ key }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: `Falha ao remover fundo: ${detail}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
