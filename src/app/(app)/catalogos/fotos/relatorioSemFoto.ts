import type { Workbook } from "exceljs";
import type { ItemSemFoto } from "./actions";
import { escreverTabela, escreverTitulo, logoBase64, nomeArquivoSeguro, novaAba, novaPasta, paraBlob, type Coluna } from "./planilhaBrasmam";

// Relatório dos itens sem foto (Código, Referência, Descrição) em Excel
// — pra repassar a editores/fotógrafos. Mesma identidade visual do
// relatório de itens (planilha ZENOAH, ver planilhaBrasmam.ts). Gerado
// 100% no navegador.
const COLUNAS: Coluna[] = [
  { titulo: "Código", largura: 14, alinhar: "center" },
  { titulo: "Referência", largura: 20, alinhar: "left" },
  { titulo: "Descrição", largura: 62.8, alinhar: "left" },
];

export async function montarRelatorioSemFoto(catalogNome: string, itens: ItemSemFoto[], logo: string | null): Promise<Workbook> {
  const workbook = await novaPasta();
  const ws = novaAba(workbook, { nome: "Itens sem foto", colunas: COLUNAS, textoFaixa: "RELATÓRIO DE ITENS SEM FOTO", logo });
  escreverTitulo(
    ws,
    4,
    (catalogNome.trim() || "Catálogo").toLocaleUpperCase("pt-BR"),
    `${itens.length} ${itens.length === 1 ? "item" : "itens"} sem foto`,
    `Gerado em ${new Date().toLocaleDateString("pt-BR")}  ·  Itens do catálogo que ainda não têm foto na galeria (pasta sem marca d'água).`
  );
  escreverTabela(
    ws,
    7,
    COLUNAS,
    itens.map((i) => [i.codigo, i.ref, i.descricao])
  );
  return workbook;
}

export async function baixarRelatorioSemFoto(catalogNome: string, itens: ItemSemFoto[]): Promise<void> {
  const workbook = await montarRelatorioSemFoto(catalogNome, itens, await logoBase64());
  const { downloadBlob } = await import("@/lib/downloadFiles");
  downloadBlob(await paraBlob(workbook), `${nomeArquivoSeguro(catalogNome)} - itens sem foto.xlsx`);
}
