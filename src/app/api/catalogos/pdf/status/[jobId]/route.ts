import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Consulta o andamento de um trabalho de geração de PDF iniciado em
// ../../route.ts (POST). Resposta curta — o trabalho em si roda no
// backend Python, fora do teto de 60s da Vercel.
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: "Id de trabalho inválido." }, { status: 400 });
  }

  const res = await fetch(`${process.env.BACKEND_URL}/catalogos/pdf/status/${jobId}`, {
    headers: { "x-shared-secret": process.env.BACKEND_SHARED_SECRET ?? "" },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    let message = detail;
    try {
      message = (JSON.parse(detail) as { detail?: string }).detail ?? detail;
    } catch {
      // resposta não era JSON — usa o texto cru
    }
    return NextResponse.json({ error: message }, { status: res.status === 404 ? 404 : 502 });
  }

  return NextResponse.json(await res.json());
}
