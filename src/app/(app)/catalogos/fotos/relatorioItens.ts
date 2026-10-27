import * as XLSX from "xlsx";
import type { ItemRelatorio } from "./actions";

// Relatório de todos os itens cadastrados no catálogo, em Excel: Código,
// Referência, Descrição e Fotos (hiperlink pra galeria do código — mesma
// página de destino do catálogo ZENOAH). Gerado 100% no navegador.
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
  return book;
}

export function baixarRelatorioItens(catalogNome: string, itens: ItemRelatorio[]): void {
  const nomeSeguro = (catalogNome.trim() || "catalogo").replace(/[\\/:*?"<>|]+/g, " ").trim();
  XLSX.writeFile(montarRelatorioItens(itens), `${nomeSeguro} - itens do catálogo.xlsx`);
}
