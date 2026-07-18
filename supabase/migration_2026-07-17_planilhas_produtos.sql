-- Migração: Planilhas de Produtos (Fase 5, Parte 4)
-- Rodar uma vez no SQL Editor do Supabase. Já incluída no final de
-- catalogos_schema.sql (fonte de verdade completa) — este arquivo é só
-- o trecho novo, isolado, pra não precisar rolar o schema inteiro.

-- A suposição original de `products` "compartilhada com o Gerador de
-- Ofertas" nunca se concretizou (Ofertas ficou 100% efêmero) e não
-- fazia sentido mesmo — planilhas de catálogo são um material
-- diferente das de oferta. `products` vira exclusiva do Criador de
-- Catálogos, com suporte a MÚLTIPLAS planilhas persistidas e
-- reaproveitáveis (não um pool único de produtos) — cada catálogo
-- escolhe qual planilha usar.
create table public.planilhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

alter table public.products
  add column planilha_id uuid references public.planilhas(id) on delete cascade;

-- codigo era único globalmente; agora só dentro da mesma planilha (o
-- mesmo código pode existir em duas planilhas diferentes, representando
-- produtos diferentes). Colunas de preço renomeadas pra bater com as
-- colunas reais da planilha de catálogo (PREÇO 1/PREÇO 2, não SP/PA
-- — isso era nomenclatura herdada por engano da suposição de tabela
-- compartilhada).
alter table public.products drop constraint if exists products_codigo_key;
alter table public.products rename column preco_sp to preco_1;
alter table public.products rename column preco_pa to preco_2;
alter table public.products alter column planilha_id set not null;
alter table public.products add constraint products_planilha_codigo_key unique (planilha_id, codigo);

alter table public.catalogs
  add column planilha_id uuid references public.planilhas(id);

alter table public.planilhas enable row level security;
create policy "authenticated full access" on public.planilhas for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.planilhas to authenticated;
