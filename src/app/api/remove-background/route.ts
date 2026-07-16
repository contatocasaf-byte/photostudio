import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy server-side pro microserviço Python (FastAPI) — evita expor a URL
// do backend e configurar CORS nele para chamadas vindas do navegador.
//
// maxDuration no teto do plano Hobby da Vercel (60s, não dá pra subir mais
// nesse plano). O backend no Render (Standard, sempre ativo) processa em
// ~5s quando já está "quente" — só a primeira chamada logo depois de um
// deploy novo do backend pode passar de 60s (baixando o modelo de novo),
// o que é raro e não afeta o uso normal do dia a dia.
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
