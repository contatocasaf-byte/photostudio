-- Criador de Catálogos — schema inicial (Fase 5, Parte 1)
-- Rodar uma vez no SQL Editor do Supabase do projeto da Suite Brasmam.
-- Não versionado por nenhuma ferramenta de migration (o projeto não usa
-- Prisma/Drizzle) — este arquivo é só a fonte de verdade documentada,
-- rodar manualmente.

create extension if not exists pgcrypto;

-- products: compartilhada com o Gerador de Ofertas (spec seção 4).
-- Fica vazia por enquanto — mecanismo de popular entra numa fase futura.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  ref text,
  descricao text,
  preco_sp numeric,
  preco_pa numeric,
  foto_key text,
  atualizado_em timestamptz not null default now()
);

create table public.catalogs (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  numero text,
  titulo text not null,
  ordem integer not null default 0,
  colunas integer not null default 3,
  ilustracao_abertura_ref text,
  criado_em timestamptz not null default now()
);
create index sections_catalog_id_idx on public.sections(catalog_id);

create table public.card_templates (
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
  criado_em timestamptz not null default now()
);
create index card_templates_section_id_idx on public.card_templates(section_id);

-- referência circular section <-> card_template: coluna adicionada
-- depois que a tabela card_templates já existe.
alter table public.sections
  add column card_template_id uuid references public.card_templates(id);

create table public.page_templates (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  is_default boolean not null default false,
  tipo text not null check (tipo in ('abertura_secao', 'continuacao', 'capa', 'custom')),
  header_json jsonb,
  footer_json jsonb,
  margens jsonb,
  criado_em timestamptz not null default now()
);
create index page_templates_catalog_id_idx on public.page_templates(catalog_id);

-- mesma situação: catalog <-> page_template.
alter table public.catalogs
  add column page_template_default_id uuid references public.page_templates(id);

create table public.catalog_pages (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  ordem integer not null default 0,
  page_template_id uuid references public.page_templates(id),
  is_override boolean not null default false
);
create index catalog_pages_catalog_id_idx on public.catalog_pages(catalog_id);
create index catalog_pages_section_id_idx on public.catalog_pages(section_id);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  product_id uuid not null references public.products(id),
  ordem integer not null default 0,
  card_template_versao integer
);
create index catalog_items_section_id_idx on public.catalog_items(section_id);

-- RLS: mesma confiança do bucket R2 (conta de equipe compartilhada,
-- sem isolamento por usuário) — qualquer usuário autenticado tem CRUD
-- completo em todas as tabelas do módulo.
alter table public.products enable row level security;
alter table public.catalogs enable row level security;
alter table public.sections enable row level security;
alter table public.card_templates enable row level security;
alter table public.page_templates enable row level security;
alter table public.catalog_pages enable row level security;
alter table public.catalog_items enable row level security;

create policy "authenticated full access" on public.products for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.catalogs for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.sections for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.card_templates for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.page_templates for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.catalog_pages for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.catalog_items for all to authenticated using (true) with check (true);
