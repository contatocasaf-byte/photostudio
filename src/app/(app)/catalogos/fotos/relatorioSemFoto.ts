import * as XLSX from "xlsx";
import type { ItemSemFoto } from "./actions";

// Relatório dos itens sem foto (Código, Referência, Descrição) em Excel
// — pra repassar a editores/fotógrafos. Gerado 100% no navegador.
export function baixarRelatorioSemFoto(catalogNome: string, itens: ItemSemFoto[]): void {
  const linhas = [["Código", "Referência", "Descrição"], ...itens.map((i) => [i.codigo, i.ref, i.descricao])];
  const sheet = XLSX.utils.aoa_to_sheet(linhas);
  sheet["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 60 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Itens sem foto");

  const nomeSeguro = (catalogNome.trim() || "catalogo").replace(/[\\/:*?"<>|]+/g, " ").trim();
  XLSX.writeFile(book, `${nomeSeguro} - itens sem foto.xlsx`);
}
