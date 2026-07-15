// Construção de URL pública não usa credenciais — pode rodar no navegador,
// diferente de lib/storage/r2.ts (que é server-only).
export function getPublicUrl(key: string) {
  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;
}
