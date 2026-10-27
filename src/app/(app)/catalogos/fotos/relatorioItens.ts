import * as XLSX from "xlsx";
import type { ItemRelatorio } from "./actions";

// Relatório de todos os itens cadastrados no catálogo, em Excel: Código,
// Referência, Descrição e Fotos (hiperlink pra galeria do código — mesma
// página de destino do catálogo ZENOAH). Gerado 100% no navegador.
// Texto da aba "Como funciona" — quem recebe a planilha (editores,
// fotógrafos) entende de onde vêm os links e os limites deles sem
// precisar perguntar. Uma linha por célula, curtas, porque a aba não tem
// quebra automática de linha.
export const INFO_LINHAS: string[][] = [
  ["Como as fotos funcionam"],
  ["• O link da coluna \"Fotos\" abre a galeria de fotos Brasmam (a mesma do catálogo ZENOAH G5200), no endereço da galeria + ?cod=<código>."],
  ["• A galeria mostra as fotos do código nas duas pastas do Drive: com marca d'água e sem marca d'água."],
  ["• O texto \"📷 N fotos\" vem da lista de fotos Brasmam (planilha do Google, atualizada todo dia por volta das 6h)."],
  ["• Código que não está na lista aparece como \"sem foto\", sem link."],
  ["• Código com letra ou hífen (ex.: 18-05-048) aparece como \"—\", sem link: a galeria só entende códigos numéricos."],
  [""],
  ["Pontos para saber"],
  ["1. A galeria abre com a conta Google de quem clica: só vê as fotos quem tem acesso às pastas no Drive."],
  ["2. A lista é atualizada uma vez por dia: uma foto adicionada hoje pode aparecer como \"sem foto\" até o dia seguinte."],
  ["3. A lista conta as duas pastas (com e sem marca d'água); a barra de fotos do catálogo no sistema conta só a pasta sem marca d'água."],
  ["   Por isso o mesmo código pode ter foto neste relatório e aparecer sem foto na barra do catálogo."],
  ["4. Se o endereço da galeria ou da lista mudar (nova publicação do app), a configuração do sistema precisa ser atualizada:"],
  ["   peça a quem mantém o sistema."],
];

export function montarRelatorioItens(itens: ItemRelatorio[]): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([["Código", "Referência", "Descrição", "Fotos"], ...itens.map((i) => [i.codigo, i.ref, i.descricao, i.fotosRotulo])]);

  // Hiperlink real na célula (não fórmula): continua clicável no Excel,
  // LibreOffice e ao importar no Google Planilhas.
  itens.forEach((item, i) => {
    if (!item.fotosUrl) return;
    sheet[XLSX.utils.encode_cell({ r: i + 1, c: 3 })] = {
      t: "s",
      v: item.fotosRotulo,
      l: { Target: item.fotosUrl, Tooltip: "Abrir as fotos deste código" },
    };
  });

  sheet["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 60 }, { wch: 16 }];
  sheet["!autofilter"] = { ref: `A1:D${itens.length + 1}` };

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Itens do catálogo");

  const info = XLSX.utils.aoa_to_sheet(INFO_LINHAS);
  info["!cols"] = [{ wch: 130 }];
  XLSX.utils.book_append_sheet(book, info, "Como funciona");
  return book;
}

export function baixarRelatorioItens(catalogNome: string, itens: ItemRelatorio[]): void {
  const nomeSeguro = (catalogNome.trim() || "catalogo").replace(/[\\/:*?"<>|]+/g, " ").trim();
  XLSX.writeFile(montarRelatorioItens(itens), `${nomeSeguro} - itens do catálogo.xlsx`);
}
