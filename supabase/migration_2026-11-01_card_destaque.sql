-- Card de DESTAQUE (produto em destaque numa linha própria, na largura da grade
-- inteira) — rodar UMA vez no Supabase (SQL Editor).
--
-- É uma migração SÓ ADITIVA: não apaga, não renomeia e não reescreve nenhuma
-- linha existente. Catálogos, jornais, card-moldes, versões, páginas e itens
-- salvos continuam exatamente como estão.
--
--   1) Cópia de segurança das tabelas mexidas, num schema à parte
--      (backup_20261101) que NÃO é exposto pela API do Supabase — fica só
--      acessível pelo SQL Editor. Pode ser apagada depois com
--          drop schema backup_20261101 cascade;
--   2) catalog_items.destaque: coluna nova, default false (todo item existente
--      continua "normal").
--   3) card_templates_destaque: tabela NOVA com o card-molde de destaque de
--      cada seção (mesmas colunas de card_templates, mesma cadeia de versões).
--      Fica separada de card_templates de propósito: nenhuma consulta atual de
--      card-molde passa a enxergar essas linhas.

-- 1) backup --------------------------------------------------------------
create schema if not exists backup_20261101;
create table if not exists backup_20261101.card_templates as table public.card_templates;
create table if not exists backup_20261101.catalog_items as table public.catalog_items;
create table if not exists backup_20261101.sections as table public.sections;

-- 2) item em destaque ------------------------------------------------------
alter table public.catalog_items
  add column if not exists destaque boolean not null default false;

-- 3) card-molde de destaque --------------------------------------------------
create table if not exists public.card_templates_destaque (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  layout_json jsonb not null default '{}'::jsonb,
  largura numeric,
  altura_minima numeric,
  altura_cresce_com text,
  campos_habilitados jsonb not null default '[]'::jsonb,
  gutter_x numeric,
  gutter_y numeric,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  shapes_json jsonb not null default '[]'::jsonb,
  borda_json jsonb not null default '{"ativa":true,"cor":"#e2e8f0","opacidade":1,"espessura":1}'::jsonb,
  unique (section_id, versao)
);
create index if not exists card_templates_destaque_section_id_idx on public.card_templates_destaque(section_id);

alter table public.card_templates_destaque enable row level security;
create policy "authenticated full access" on public.card_templates_destaque for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.card_templates_destaque to authenticated;

-- Conferência (opcional): as contagens abaixo devem ser iguais às do backup.
--   select (select count(*) from public.card_templates) as card_templates,
--          (select count(*) from backup_20261101.card_templates) as backup_card_templates,
--          (select count(*) from public.catalog_items) as catalog_items,
--          (select count(*) from backup_20261101.catalog_items) as backup_catalog_items,
--          (select count(*) from public.catalog_items where destaque) as itens_em_destaque_deve_ser_0;
