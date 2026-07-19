import { googleFontsHref } from "@/lib/fonts/googleFonts";

// Carrega a lista curada de Google Fonts pro segmento /ofertas inteiro
// (as 3 abas usam texto com fonte escolhida) — só declara o
// @font-face via CSS, o navegador baixa cada peso sob demanda quando
// algo realmente usa aquela fonte.
export default function OfertasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href={googleFontsHref()} />
      {children}
    </>
  );
}
