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

-- GRANT de tabela — nível ABAIXO do RLS. RLS decide quais LINHAS
-- aparecem, mas sem esse GRANT o Postgres já barra o acesso à tabela
-- inteira pro role "authenticated" (o que o PostgREST/Supabase usa nas
-- queries de um usuário logado), retornando "permission denied for
-- table X" mesmo com a policy certa. Tabelas criadas via SQL Editor não
-- herdam esse grant automaticamente.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.products,
  public.catalogs,
  public.sections,
  public.card_templates,
  public.page_templates,
  public.catalog_pages,
  public.catalog_items
to authenticated;

-- Fase 5, Parte 3 (Editor de Página): tamanho de página nunca foi
-- definido em lugar nenhum do modelo de dados original — necessário
-- pra qualquer posicionamento em pixel fazer sentido, e pro PDF final
-- (fase futura). Compartilhado por todos os page_templates do mesmo
-- catálogo (catálogo impresso tem um tamanho de página só). Default
-- A4 em proporção de pixel.
alter table public.catalogs
  add column pagina_largura numeric not null default 1240,
  add column pagina_altura numeric not null default 1754;

-- Plano de fundo da página inteira (textura, moldura decorativa, arte
-- de seção) — a especificação original de PageTemplate só previa
-- cabeçalho/rodapé com campos fixos, sem imagem de fundo cobrindo a
-- página, diferente do Gerador de Ofertas (onde o "layout" já É uma
-- imagem de fundo completa). Nullable: nem todo modelo precisa de um.
alter table public.page_templates
  add column fundo_key text;

-- Fase 5, Parte 4 (Planilhas de Produtos): a suposição original de
-- `products` "compartilhada com o Gerador de Ofertas" nunca se
-- concretizou (Ofertas ficou 100% efêmero) e não fazia sentido mesmo
-- — planilhas de catálogo são um material diferente das de oferta.
-- `products` vira exclusiva do Criador de Catálogos, com suporte a
-- MÚLTIPLAS planilhas persistidas e reaproveitáveis (não um pool único
-- de produtos) — cada catálogo escolhe qual planilha usar.
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

-- Formas decorativas (retângulo/elipse/triângulo) no card-molde — sem
-- vínculo com dado de produto nenhum, por isso não entram no
-- layout_json (que é indexado por CardFieldKey, um por campo). Lista
-- livre, tamanho variável, guardada à parte.
alter table public.card_templates
  add column shapes_json jsonb not null default '[]'::jsonb;

-- Contorno do card na grade do catálogo montado — configurável
-- (liga/desliga, cor, transparência, espessura). Default reproduz a
-- aparência antiga (contorno cinza claro fixo, sempre ligado), pra não
-- mudar a aparência de card-molde já salvo.
alter table public.card_templates
  add column borda_json jsonb not null default '{"ativa":true,"cor":"#e2e8f0","opacidade":1,"espessura":1}'::jsonb;

-- Galeria de fotos via Google Drive (Fase 5, Parte 7) — configuração
-- global (não por catálogo), sempre uma linha só. O casamento
-- foto<->produto por código roda em memória a cada carregamento do
-- preview (sem gravar nada em products.foto_key) — ver
-- catalogos/galeria/actions.ts e catalogos/core/matchGaleriaFoto.ts.
create table public.galeria_config (
  id uuid primary key default gen_random_uuid(),
  drive_folder_id text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.galeria_config enable row level security;
create policy "authenticated full access" on public.galeria_config for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.galeria_config to authenticated;
