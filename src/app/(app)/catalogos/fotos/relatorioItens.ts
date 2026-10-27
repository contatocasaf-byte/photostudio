import type { Workbook } from "exceljs";
import type { ItemRelatorio } from "./actions";
import {
  COR,
  FONTE,
  escreverTabela,
  escreverTitulo,
  logoBase64,
  nomeArquivoSeguro,
  novaAba,
  novaPasta,
  paraBlob,
  type Celula,
  type Coluna,
} from "./planilhaBrasmam";

// Relatório de todos os itens cadastrados no catálogo, em Excel com a
// identidade visual da planilha ZENOAH (ver planilhaBrasmam.ts): Código,
// Referência, Descrição e Fotos (hiperlink pra galeria do código — mesma
// página de destino do catálogo ZENOAH). Gerado 100% no navegador.

const COLUNAS: Coluna[] = [
  { titulo: "Código", largura: 14, alinhar: "center" },
  { titulo: "Referência", largura: 20, alinhar: "left" },
  { titulo: "Descrição", largura: 62.8, alinhar: "left" },
  { titulo: "Fotos", largura: 16, alinhar: "center" },
];

// Texto da aba "Como funciona" — quem recebe a planilha (editores,
// fotógrafos) entende de onde vêm os links e os limites deles sem
// precisar perguntar.
export const INFO_BLOCOS: { titulo: string; linhas: string[] }[] = [
  {
    titulo: "Como as fotos funcionam",
    linhas: [
      "• O link da coluna \"Fotos\" abre a galeria de fotos Brasmam, no endereço da galeria + ?cod=<código>.",
      "• A galeria mostra as fotos do código nas duas pastas do Drive: com marca d'água e sem marca d'água.",
      "• O texto \"📷 N fotos\" vem da lista de fotos Brasmam (planilha do Google, atualizada todo dia por volta das 6h).",
      "• Código que não está na lista aparece como \"sem foto\", sem link.",
      "• Código com letra ou hífen (ex.: 18-05-048) aparece como \"—\", sem link: a galeria só entende códigos numéricos.",
    ],
  },
  {
    titulo: "Pontos para saber",
    linhas: [
      "1. A galeria abre com a conta Google de quem clica: só vê as fotos quem tem acesso às pastas no Drive.",
      "2. A lista é atualizada uma vez por dia: uma foto adicionada hoje pode aparecer como \"sem foto\" até o dia seguinte.",
      "3. A lista conta as duas pastas (com e sem marca d'água); a barra de fotos do catálogo no sistema conta só a pasta sem marca d'água. Por isso o mesmo código pode ter foto neste relatório e aparecer sem foto na barra do catálogo.",
      "4. Se o endereço da galeria ou da lista mudar (nova publicação do app), a configuração do sistema precisa ser atualizada: peça a quem mantém o sistema.",
    ],
  },
];

function celulaFotos(item: ItemRelatorio): Celula {
  if (item.fotosUrl) return { texto: item.fotosRotulo, url: item.fotosUrl };
  return { texto: item.fotosRotulo, apagado: true };
}

export async function montarRelatorioItens(catalogNome: string, itens: ItemRelatorio[], logo: string | null): Promise<Workbook> {
  const workbook = await novaPasta();
  const hoje = new Date().toLocaleDateString("pt-BR");
  const comFoto = itens.filter((i) => i.fotosUrl).length;

  // --- aba 1: itens ---
  const ws = novaAba(workbook, { nome: "Itens do catálogo", colunas: COLUNAS, textoFaixa: "RELATÓRIO DE ITENS DO CATÁLOGO", logo });
  escreverTitulo(
    ws,
    4,
    (catalogNome.trim() || "Catálogo").toLocaleUpperCase("pt-BR"),
    `${itens.length} ${itens.length === 1 ? "item" : "itens"}  ·  ${comFoto} com foto`,
    `Gerado em ${hoje}  ·  Clique em "📷 N fotos" para abrir a galeria do código (aba "Como funciona" explica os detalhes).`
  );
  escreverTabela(
    ws,
    7,
    COLUNAS,
    itens.map((i) => [i.codigo, i.ref, i.descricao, celulaFotos(i)])
  );

  // --- aba 2: como funciona ---
  const info = novaAba(workbook, { nome: "Como funciona", colunas: COLUNAS, textoFaixa: "COMO FUNCIONA", logo, abaClara: true });
  const largura = COLUNAS.reduce((s, c) => s + c.largura, 0);
  let linha = 4;
  for (const bloco of INFO_BLOCOS) {
    info.mergeCells(linha, 1, linha, COLUNAS.length);
    const t = info.getCell(linha, 1);
    t.value = bloco.titulo.toLocaleUpperCase("pt-BR");
    t.font = { name: FONTE.titulo, size: 16, color: { argb: COR.escuro } };
    t.alignment = { vertical: "middle" };
    for (let c = 1; c <= COLUNAS.length; c++) info.getCell(linha, c).border = { bottom: { style: "medium", color: { argb: COR.vermelho } } };
    info.getRow(linha).height = 24;
    linha++;

    for (const texto of bloco.linhas) {
      info.mergeCells(linha, 1, linha, COLUNAS.length);
      const cel = info.getCell(linha, 1);
      cel.value = texto;
      cel.font = { name: FONTE.texto, size: 10, color: { argb: COR.escuro } };
      cel.alignment = { vertical: "top", wrapText: true };
      // ExcelJS não ajusta a altura de célula mesclada sozinho — estima
      // pelo nº de caracteres que cabem na largura total.
      const linhasDeTexto = Math.max(1, Math.ceil(texto.length / (largura * 0.95)));
      info.getRow(linha).height = 15.5 * linhasDeTexto + 4;
      linha++;
    }
    linha++; // respiro entre blocos
  }
  info.views = [{ showGridLines: false, zoomScale: 85 }];

  return workbook;
}

export async function baixarRelatorioItens(catalogNome: string, itens: ItemRelatorio[]): Promise<void> {
  const workbook = await montarRelatorioItens(catalogNome, itens, await logoBase64());
  const { downloadBlob } = await import("@/lib/downloadFiles");
  downloadBlob(await paraBlob(workbook), `${nomeArquivoSeguro(catalogNome)} - itens do catálogo.xlsx`);
}
