-- Fase 6: sistema de papéis e permissões granulares. Rodar uma vez no
-- SQL Editor do Supabase — depois disso, rodar o bloco de "bootstrap
-- do administrador" no final deste arquivo (uma vez só, editando o
-- e-mail se necessário).

-- Perfil 1:1 com auth.users — id é o MESMO uuid do Supabase Auth (não
-- um uuid próprio), on delete cascade: apagar a conta no Auth apaga o
-- perfil junto.
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  papel text not null default 'usuario' check (papel in ('usuario', 'supervisor', 'administrador')),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Permissões concedidas — EAV (uma linha por chave concedida) em vez
-- de colunas booleanas fixas: o histórico deste projeto mostra módulos
-- ganhando funcionalidade nova com frequência — adicionar uma
-- permissão nova vira só uma entrada a mais na constante de código
-- (src/lib/auth/permissoes.ts), zero "alter table".
create table public.permissoes_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  chave text not null,
  concedido_por uuid references auth.users(id) on delete set null,
  concedido_em timestamptz not null default now(),
  unique (usuario_id, chave)
);
create index permissoes_usuario_usuario_id_idx on public.permissoes_usuario(usuario_id);

-- RLS: diferente do resto do schema deste projeto ("authenticated full
-- access" — conta de equipe compartilhada, ver supabase/catalogos_schema.sql),
-- aqui é dado de AUTORIZAÇÃO, não dado de negócio — usuário comum só
-- lê o PRÓPRIO perfil/permissões. Toda escrita (criar conta, mudar
-- papel, conceder/revogar permissão) passa exclusivamente pelo client
-- de service role dentro das Server Actions administrativas
-- (src/app/(app)/usuarios/actions.ts), que ignora RLS — por isso não
-- existe nenhuma policy de insert/update/delete pra "authenticated"
-- aqui, de propósito.
alter table public.perfis enable row level security;
alter table public.permissoes_usuario enable row level security;

create policy "usuario le proprio perfil" on public.perfis
  for select to authenticated using (id = auth.uid());
create policy "usuario le propria permissao" on public.permissoes_usuario
  for select to authenticated using (usuario_id = auth.uid());

-- GRANT de tabela é obrigatório mesmo com RLS certo (mesma pegadinha já
-- documentada no resto do schema: RLS filtra LINHAS, mas sem o GRANT o
-- Postgres já barra a TABELA inteira pro role). Vale tanto pra
-- "authenticated" (leitura da própria linha, direto do navegador)
-- quanto pra "service_role" (usado pelas Server Actions administrativas
-- de /usuarios, que fazem CRUD completo via src/lib/supabase/admin.ts —
-- sem este grant, toda ação em /usuarios falha com "permission denied
-- for table perfis", mesmo o service_role já ignorando RLS).
grant usage on schema public to authenticated, service_role;
grant select on public.perfis, public.permissoes_usuario to authenticated;
grant select, insert, update, delete on public.perfis, public.permissoes_usuario to service_role;

-- Trigger: qualquer conta nova em auth.users (criada por QUALQUER via —
-- dashboard do Supabase, Admin API, futuro) nasce com um perfil
-- 'usuario' sem nenhuma permissão marcada. Fail-safe: acesso zero por
-- padrão, precisa de um Supervisor/Administrador liberar manualmente
-- em /usuarios — evita perfil "órfão" quebrar getCurrentAccess() se
-- alguém criar uma conta fora da tela /usuarios (ex.: dashboard).
create or replace function public.criar_perfil_padrao()
returns trigger language plpgsql security definer as $$
begin
  insert into public.perfis (id, email, papel)
  values (new.id, new.email, 'usuario')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_padrao();

-- Bootstrap do administrador — rodar DEPOIS do bloco acima, uma vez só
-- (idempotente: on conflict atualiza o papel se já existir perfil).
-- A conta já precisa existir em auth.users (login já funciona hoje).
insert into public.perfis (id, email, papel)
select id, email, 'administrador'
from auth.users
where email = 'contatocasaf@gmail.com'
on conflict (id) do update set papel = 'administrador';
