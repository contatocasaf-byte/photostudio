import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy server-side pro microserviço Python (FastAPI) — mesmo padrão de
// src/app/api/remove-background/route.ts (evita expor a URL do backend,
// checa a sessão Supabase aqui já que o Python só confere o segredo
// compartilhado, não sabe nada de usuário).
//
// Só INICIA a geração e devolve o id do trabalho na hora: a rota da
// Vercel tem teto de 60s por requisição (plano Hobby), e catálogo grande
// passa disso. O andamento é consultado em ./status/[jobId].
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const payload = await request.json();
  if (!payload?.pages?.length) {
    return NextResponse.json({ error: "Catálogo sem páginas pra exportar." }, { status: 400 });
  }

  const res = await fetch(`${process.env.BACKEND_URL}/catalogos/pdf/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shared-secret": process.env.BACKEND_SHARED_SECRET ?? "",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `Falha ao iniciar a geração do PDF: ${detail}` }, { status: 502 });
  }

  return NextResponse.json(await res.json());
}
