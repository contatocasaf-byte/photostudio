// Porta formatar_preco_br (core.py:288-334): recebe um preço em
// praticamente qualquer formato digitado ou vindo de planilha (ex:
// "1234.5", "1234,5", "1.234,56", "R$ 99,90") e devolve sempre no padrão
// brasileiro — milhar com ponto, centavos com vírgula, 2 casas decimais.
// Se não for possível interpretar como número, devolve o texto original
// sem alterações (pra não quebrar entradas inesperadas).
export function formatarPrecoBR(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor).trim();
  if (!texto) return "";

  const limpo = texto.replace(/[^\d.,]/g, "");
  if (!limpo) return texto;

  const posVirgula = limpo.lastIndexOf(",");
  const posPonto = limpo.lastIndexOf(".");

  let inteiroStr: string;
  let decimalStr: string;

  if (posVirgula > posPonto) {
    // vírgula é decimal; pontos (se houver) são milhar
    const semPontos = limpo.replace(/\./g, "");
    const idx = semPontos.lastIndexOf(",");
    inteiroStr = semPontos.slice(0, idx);
    decimalStr = semPontos.slice(idx + 1);
  } else if (posPonto > posVirgula) {
    // ponto é decimal; vírgulas (se houver) são milhar
    const semVirgulas = limpo.replace(/,/g, "");
    const idx = semVirgulas.lastIndexOf(".");
    inteiroStr = semVirgulas.slice(0, idx);
    decimalStr = semVirgulas.slice(idx + 1);
  } else {
    // só dígitos, sem separador decimal explícito
    inteiroStr = limpo;
    decimalStr = "";
  }

  inteiroStr = inteiroStr || "0";
  decimalStr = (decimalStr + "00").slice(0, 2);

  const inteiroInt = parseInt(inteiroStr, 10);
  if (Number.isNaN(inteiroInt)) return texto;

  const inteiroFormatado = inteiroInt.toLocaleString("en-US").replace(/,/g, ".");

  return `${inteiroFormatado},${decimalStr}`;
}
