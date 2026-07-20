import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy server-side pro microserviço Python (FastAPI) — mesmo padrão de
// src/app/api/catalogos/pdf/route.ts: checa a sessão Supabase aqui (o
// Python só confere o segredo compartilhado, não sabe nada de usuário)
// e repassa a chave do PDF já enviado pro R2 pra ser rasterizado.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const body = await request.json();
  if (!body?.key || !body?.width || !body?.height) {
    return NextResponse.json({ error: "Faltam key/width/height." }, { status: 400 });
  }

  const res = await fetch(`${process.env.BACKEND_URL}/catalogos/render-pdf-background`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shared-secret": process.env.BACKEND_SHARED_SECRET ?? "",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `Falha ao converter PDF: ${detail}` }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
