-- Migração: Formas decorativas no card-molde
-- Rodar uma vez no SQL Editor do Supabase. Já incluída no final de
-- catalogos_schema.sql (fonte de verdade completa) — este arquivo é só
-- o trecho novo, isolado, pra não precisar rolar o schema inteiro.

alter table public.card_templates
  add column shapes_json jsonb not null default '[]'::jsonb;
