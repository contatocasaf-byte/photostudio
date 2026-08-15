-- Campo "Quantidade mínima" / "Múltiplos" (compartilhado entre
-- Catálogos e Jornal de Ofertas — mesmo dado, legenda diferente por
-- contexto, configurada no texto editável do card-molde de cada
-- seção). Rodar uma vez no Supabase.
alter table public.products
  add column quantidade_minima numeric;
