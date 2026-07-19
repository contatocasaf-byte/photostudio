-- Páginas avulsas entre seções (Fase 5, Parte 12) — rodar uma vez no
-- SQL Editor do Supabase. Já incluído também em catalogos_schema.sql
-- (fonte de verdade completa) para referência futura.
create table public.paginas_avulsas (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  titulo text not null,
  apos_secao_id uuid references public.sections(id) on delete set null,
  ordem integer not null default 0,
  page_template_id uuid not null references public.page_templates(id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index paginas_avulsas_catalog_id_idx on public.paginas_avulsas(catalog_id);
create index paginas_avulsas_apos_secao_id_idx on public.paginas_avulsas(apos_secao_id);

alter table public.paginas_avulsas enable row level security;
create policy "authenticated full access" on public.paginas_avulsas for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.paginas_avulsas to authenticated;
