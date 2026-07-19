import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy server-side pro microserviço Python (FastAPI) — mesmo padrão de
// src/app/api/remove-background/route.ts (evita expor a URL do backend,
// checa a sessão Supabase aqui já que o Python só confere o segredo
// compartilhado, não sabe nada de usuário).
//
// Mesmo teto de 60s do plano Hobby da Vercel — catálogos muito grandes
// (muitas páginas × muitas fotos) podem esbarrar nisso; aceito como
// limitação desta primeira entrega (ver plano, Fase 5 Parte 10).
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

  const res = await fetch(`${process.env.BACKEND_URL}/catalogos/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shared-secret": process.env.BACKEND_SHARED_SECRET ?? "",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `Falha ao gerar PDF: ${detail}` }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
