// Ordenação dos produtos de uma seção por coluna (Código, Referência ou
// Descrição) — usada só no Jornal de Ofertas. Comparação "natural" e sem
// diferenciar maiúsculas/acentos: 2 vem antes de 10, "Á" junto do "A", e
// "26-06-234/B" antes de "26-06-234/C". Valor vazio (ex.: produto sem
// referência) fica sempre no FIM, tanto na ordem crescente quanto na
// decrescente.

export type ColunaOrdenacao = "codigo" | "ref" | "descricao";
export type DirecaoOrdenacao = "asc" | "desc";

type ItemOrdenavel = { product: { codigo: string; ref?: string | null; descricao?: string | null } };

const colador = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function valorDaColuna(item: ItemOrdenavel, coluna: ColunaOrdenacao): string {
  const bruto = coluna === "codigo" ? item.product.codigo : coluna === "ref" ? item.product.ref : item.product.descricao;
  return (bruto ?? "").trim();
}

export function ordenarItensSecao<T extends ItemOrdenavel>(itens: T[], coluna: ColunaOrdenacao, direcao: DirecaoOrdenacao): T[] {
  const sinal = direcao === "asc" ? 1 : -1;
  return [...itens].sort((a, b) => {
    const va = valorDaColuna(a, coluna);
    const vb = valorDaColuna(b, coluna);
    if (!va && !vb) return colador.compare(a.product.codigo, b.product.codigo);
    if (!va) return 1;
    if (!vb) return -1;
    const c = colador.compare(va, vb);
    // Empate: desempata pelo código (sempre crescente) pra ordem previsível.
    return c !== 0 ? c * sinal : colador.compare(a.product.codigo, b.product.codigo);
  });
}
