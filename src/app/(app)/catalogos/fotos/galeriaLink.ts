// Link "Fotos" dos relatórios — MESMA mecânica do catálogo ZENOAH G5200:
// - página de destino: web app "Galeria de fotos Brasmam" (Google Apps
//   Script, pasta com e sem marca d'água), aberto em `<url>?cod=<código>`;
// - rótulo "📷 N fotos": vem da "Lista de fotos Brasmam (automática)"
//   (planilha Google publicada como CSV, atualizada todo dia ~6h pelo
//   mesmo script), colunas CODIGO | ROTULO | ID | ARQUIVO.
// Os dois endereços são públicos por natureza (web app "qualquer um" e
// planilha publicada na web) — não são segredos. Podem ser trocados por
// variável de ambiente sem mexer no código.
// Código de referência: ver galeria_fotos/ do projeto ZENOAH (Code.gs,
// ListaFotos.gs) em Documentos\Catálogos\VISTAS EXPLODIDAS\ZENOAH.

export const GALERIA_WEBAPP_URL =
  process.env.FOTOS_GALERIA_URL ||
  "https://script.google.com/macros/s/AKfycbwVH_DvQ_MZr-FLT9cncyVlPBKF11w6DxqvWKstOVdm1mw5IOZKZY1dmx5k6UMVSbb7/exec";

export const LISTA_FOTOS_CSV_URL =
  process.env.FOTOS_LISTA_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR1kYPhkzpLbDipHJlrVbeS9AYC9GRzAKc5IcWgNegubMkbeST5Ob8zQfGVYK4KBeFIBq1jBkfubNMN/pub?gid=0&single=true&output=csv";

// A página de galeria e a lista de fotos só entendem código NUMÉRICO
// (o web app faz `cod.replace(/\D/g, '')` e a lista indexa por
// `parseInt`) — código com letra/hífen (ex. "18-05-048") não casa, então
// fica sem link em vez de abrir a galeria de outro código.
export function codigoNumerico(codigo: string): string | null {
  const limpo = codigo.trim();
  return /^\d+$/.test(limpo) ? limpo : null;
}

// Extensão do arquivo em maiúsculas ("15919_1.jpg" -> "JPG", "x.JPEG" ->
// "JPEG"). Sem extensão reconhecível, devolve "" (o chamador mostra "—").
export function extensaoDoArquivo(nome: string): string {
  const m = /\.([A-Za-z0-9]{2,5})\s*$/.exec(nome.trim());
  return m ? m[1].toUpperCase() : "";
}

// Mesma chave da lista: número sem zeros à esquerda ("00123" -> "123").
export function chaveLista(codigoNum: string): string {
  return String(parseInt(codigoNum, 10));
}

export function linkGaleria(codigoNum: string): string {
  return `${GALERIA_WEBAPP_URL}?cod=${encodeURIComponent(codigoNum)}`;
}

// CSV (RFC 4180 enxuto: aspas duplas, "" escapa aspas, quebra de linha
// dentro de campo entre aspas) -> mapa chave-do-código -> rótulo.
export function parseListaFotosCsv(texto: string): Map<string, string> {
  const rows: string[][] = [];
  let row: string[] = [];
  let campo = "";
  let emAspas = false;
  const s = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (emAspas) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          campo += '"';
          i++;
        } else emAspas = false;
      } else campo += c;
    } else if (c === '"') emAspas = true;
    else if (c === ",") {
      row.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(campo);
      campo = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else campo += c;
  }
  if (campo !== "" || row.length > 0) {
    row.push(campo);
    if (row.some((v) => v !== "")) rows.push(row);
  }

  const mapa = new Map<string, string>();
  const [cabecalho, ...dados] = rows;
  if (!cabecalho) return mapa;
  const iCodigo = cabecalho.findIndex((h) => h.trim().toUpperCase() === "CODIGO");
  const iRotulo = cabecalho.findIndex((h) => h.trim().toUpperCase() === "ROTULO");
  if (iCodigo < 0 || iRotulo < 0) return mapa;

  for (const r of dados) {
    const cod = (r[iCodigo] ?? "").trim();
    const rotulo = (r[iRotulo] ?? "").trim();
    if (/^\d+$/.test(cod) && rotulo) mapa.set(chaveLista(cod), rotulo);
  }
  return mapa;
}
