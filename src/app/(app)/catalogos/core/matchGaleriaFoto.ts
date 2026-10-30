// Casamento foto<->produto por código pra galeria via Google Drive
// (Fase 5, Parte 7) — adaptado de encontrarFotoProduto
// (ofertas/core/findProductPhoto.ts): mesma convenção CODIGO_N.ext
// (menor N primeiro, fallback pra CODIGO.ext exato), mas operando
// sobre a listagem do Drive ({id,name}[]) em vez de LazyFileEntry[]
// do filesystem local, e indexado de uma vez pra resolver todos os
// produtos de um catálogo sem reescanear a lista inteira por produto.
// Comparação por código é case-insensitive em toda a função (o
// Ofertas tem uma inconsistência aqui — regex do _N é case-sensitive
// mas o fallback exato não é —, não vale a pena portar isso pro
// código novo).
// `version` = "assinatura" do conteúdo no Drive (md5Checksum, ou a data de
// modificação se o Drive não informar) — muda quando a foto é substituída
// mesmo mantendo o MESMO nome/id. É o que faz o cache de fotos no R2
// perceber que a foto trocou (ver src/lib/galeriaCache*.ts).
export type GaleriaFile = { id: string; name: string; version?: string };

type Candidato = { file: GaleriaFile; n: number | null }; // n = null → match exato CODIGO.ext, sem sufixo

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

// Assume que código de produto não contém "_seguido de dígitos" no
// final (verdade pra toda convenção usada neste projeto até agora,
// ex.: "18-05-048" — usa hífen, não underscore) — sem essa suposição
// não dá pra indexar os arquivos sem já saber os códigos de antemão.
const SUFFIX_PATTERN = /^(.+)_(\d+)$/;

export function buildGaleriaIndex(files: GaleriaFile[]): Map<string, Candidato[]> {
  const index = new Map<string, Candidato[]>();
  for (const file of files) {
    const stem = stemOf(file.name);
    const m = stem.match(SUFFIX_PATTERN);
    const codigo = (m ? m[1] : stem).trim().toLowerCase();
    if (!codigo) continue;
    const n = m ? parseInt(m[2], 10) : null;
    const list = index.get(codigo) ?? [];
    list.push({ file, n });
    index.set(codigo, list);
  }
  return index;
}

// Arquivo do Drive que o catálogo usa pra esse código (menor N primeiro,
// senão o CODIGO.ext exato), ou null se nenhuma foto bater.
export function resolveGaleriaArquivo(index: Map<string, Candidato[]>, codigo: string): GaleriaFile | null {
  const candidatos = index.get(codigo.trim().toLowerCase());
  if (!candidatos || candidatos.length === 0) return null;

  const comSufixo = candidatos.filter((c) => c.n !== null);
  if (comSufixo.length > 0) {
    comSufixo.sort((a, b) => (a.n as number) - (b.n as number));
    return comSufixo[0].file;
  }

  return candidatos[0].file;
}

// Só o `fileId` (usado por quem não precisa do nome/versão).
export function resolveGaleriaFoto(index: Map<string, Candidato[]>, codigo: string): string | null {
  return resolveGaleriaArquivo(index, codigo)?.id ?? null;
}
