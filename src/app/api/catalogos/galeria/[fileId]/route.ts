import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDriveClient } from "@/lib/googleDrive";
import { chaveDaFoto, chaveMiniatura, existeNoCache, galeriaCacheAtivo, garantirFotoNoCache, linkTemporarioDaFoto, metadadosDoArquivo } from "@/lib/galeriaCache";

// Foto da galeria do Drive (Fase 5, Parte 7), sempre atrás do login.
//
// Com o cache ligado (R2_GALERIA_BUCKET_NAME): garante que a foto está no
// bucket privado do R2 (copia do Drive na 1ª vez) e responde 302 pra um link
// temporário assinado — os bytes da foto NÃO passam pela Vercel (era o que
// estourava a cota de Fast Origin Transfer). Normalmente a tela já recebe os
// links temporários prontos e nem chega aqui; esta rota cobre as fotos ainda
// não copiadas.
//
// Sem o cache (ou se algo falhar nele): comportamento de antes — baixa do
// Drive e devolve os bytes, pra nunca deixar uma foto sem aparecer.
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

  if (galeriaCacheAtivo()) {
    try {
      const url = new URL(request.url);
      let version = url.searchParams.get("v");
      let nome = "";
      let mime: string | undefined;
      // Sem versão na URL: consulta o Drive (1 chamada leve).
      if (!version) {
        const meta = await metadadosDoArquivo(fileId);
        if (!meta) throw new Error("sem metadados");
        version = meta.version;
        nome = meta.name;
        mime = meta.mimeType;
      }
      const key = chaveDaFoto(fileId, version, nome, mime);
      await garantirFotoNoCache({ fileId, version, key });
      // ?p=1 = pedido da tela de visualização: miniatura leve, se existir
      // (senão a original).
      let keyFinal = key;
      if (url.searchParams.get("p") === "1") {
        const keyMini = chaveMiniatura(key);
        if (await existeNoCache(keyMini)) keyFinal = keyMini;
      }
      const link = await linkTemporarioDaFoto(keyFinal);
      return NextResponse.redirect(link, {
        status: 302,
        // O navegador pode guardar o redirecionamento por um tempo — o link
        // temporário é estável dentro da janela de 6h.
        headers: { "Cache-Control": "private, max-age=600" },
      });
    } catch {
      // cai pro caminho antigo abaixo
    }
  }

  try {
    const drive = createDriveClient();
    const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const bytes = res.data as unknown as ArrayBuffer;
    const contentType = (res.headers?.["content-type"] as string | undefined) ?? "application/octet-stream";

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao carregar a foto." }, { status: 502 });
  }
}
