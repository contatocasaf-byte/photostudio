import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy server-side pro microserviço Python (FastAPI) — evita expor a URL
// do backend e configurar CORS nele para chamadas vindas do navegador.
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
