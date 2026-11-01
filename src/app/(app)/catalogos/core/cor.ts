// Converte "#rrggbb" (ou "#rgb") + opacidade 0-1 em "rgba(r,g,b,a)" — o Konva
// aplica `opacity` no nó inteiro (traço junto); pra um fundo translúcido sem
// afetar o contorno, a transparência vai dentro da própria cor.
export function corComOpacidade(hex: string, opacidade: number): string {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const n = parseInt(h, 16);
  const a = Math.max(0, Math.min(1, opacidade));
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
