// Lista curada de fontes do Google Fonts — licença aberta (SIL Open
// Font License / Apache), feitas exatamente pra esse tipo de uso
// (embutir/redistribuir). Não são armazenadas no R2: carregadas direto
// do CDN do Google via <link>, ao contrário das fontes PRÓPRIAS que o
// usuário sobe (essas sim ficam em fontes/ no bucket — ver actions.ts).
//
// Escolhida como alternativa a "subir todas as fontes do computador"
// (majoritariamente licenciadas pela Microsoft, sem permissão de
// redistribuir o arquivo) e a "todas as fontes da Canva" (não há lista
// pública, boa parte é licenciada só pra plataforma deles) — decisão
// registrada na conversa com o usuário. A Canva usa bastante Google
// Fonts no plano grátis, então essa lista cobre boa parte do visual
// similar, com segurança de licença.
export type GoogleFontDef = {
  family: string;
  weights: number[]; // 400 = normal, 700 = bold
};

export const GOOGLE_FONTS: GoogleFontDef[] = [
  { family: "Montserrat", weights: [400, 700] },
  { family: "Open Sans", weights: [400, 700] },
  { family: "Playfair Display", weights: [400, 700] },
  { family: "Bebas Neue", weights: [400] },
  { family: "Roboto", weights: [400, 700] },
  { family: "Lato", weights: [400, 700] },
  { family: "Poppins", weights: [400, 700] },
  { family: "Raleway", weights: [400, 700] },
  { family: "Oswald", weights: [400, 700] },
  { family: "Nunito", weights: [400, 700] },
  { family: "Merriweather", weights: [400, 700] },
  { family: "Lora", weights: [400, 700] },
  { family: "PT Serif", weights: [400, 700] },
  { family: "Source Sans 3", weights: [400, 700] },
  { family: "Inter", weights: [400, 700] },
  { family: "Work Sans", weights: [400, 700] },
  { family: "Quicksand", weights: [400, 700] },
  { family: "Dancing Script", weights: [400, 700] },
  { family: "Pacifico", weights: [400] },
  { family: "Abril Fatface", weights: [400] },
  { family: "Josefin Sans", weights: [400, 700] },
  { family: "Comfortaa", weights: [400, 700] },
  { family: "DM Sans", weights: [400, 700] },
  { family: "Libre Baskerville", weights: [400, 700] },
];

// Uma única URL pro CSS2 API do Google Fonts, pedindo todas as famílias
// e pesos curados de uma vez — o navegador baixa só o que realmente
// usar (o link só declara @font-face, não força download).
export function googleFontsHref(): string {
  const families = GOOGLE_FONTS.map((f) => {
    const name = f.family.replace(/ /g, "+");
    const weights = f.weights.join(";");
    return `family=${name}:wght@${weights}`;
  }).join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

export function hasWeight(family: string, weight: number): boolean {
  return GOOGLE_FONTS.find((f) => f.family === family)?.weights.includes(weight) ?? false;
}
