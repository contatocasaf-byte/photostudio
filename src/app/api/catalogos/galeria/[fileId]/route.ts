import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDriveClient } from "@/lib/googleDrive";

// Proxy autenticado pra baixar uma foto da galeria do Drive (Fase 5,
// Parte 7) — mesmo motivo do proxy de /remove-background: o
// navegador nunca fala direto com o Drive. Aqui é ainda mais
// necessário porque loadImage/loadImageToCanvas (src/lib/loadImage.ts,
// src/lib/fitImageOnCanvas.ts) setam `img.crossOrigin = "anonymous"`
// — uma URL do Drive sem CORS correto pra este domínio taintaria o
// canvas, quebrando fitImageOnCanvas (usa getImageData). Arquivos só
// acessíveis pela service account também não têm URL pública de
// qualquer forma.
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const { fileId } = await params;
  if (!fileId) {
    return NextResponse.json({ error: "Faltou o id do arquivo." }, { status: 400 });
  }

  try {
    const drive = createDriveClient();
    const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const bytes = res.data as unknown as ArrayBuffer;
    const contentType = (res.headers?.["content-type"] as string | undefined) ?? "application/octet-stream";

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        // Curto o bastante pra refletir troca de foto na pasta do
        // Drive sem demora perceptível, longo o bastante pra evitar
        // baixar a mesma foto de novo a cada navegação de página do
        // mesmo catálogo dentro de uma sessão.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao carregar a foto." }, { status: 502 });
  }
}
