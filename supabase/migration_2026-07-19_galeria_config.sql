-- Migração: Galeria de fotos via Google Drive (configuração)
-- Rodar uma vez no SQL Editor do Supabase. Já incluída no final de
-- catalogos_schema.sql (fonte de verdade completa) — este arquivo é só
-- o trecho novo, isolado, pra não precisar rolar o schema inteiro.

create table public.galeria_config (
  id uuid primary key default gen_random_uuid(),
  drive_folder_id text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.galeria_config enable row level security;
create policy "authenticated full access" on public.galeria_config for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.galeria_config to authenticated;
