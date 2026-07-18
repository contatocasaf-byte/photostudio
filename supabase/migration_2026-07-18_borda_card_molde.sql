-- Migração: Contorno configurável do card na grade do catálogo montado
-- Rodar uma vez no SQL Editor do Supabase. Já incluída no final de
-- catalogos_schema.sql (fonte de verdade completa) — este arquivo é só
-- o trecho novo, isolado, pra não precisar rolar o schema inteiro.

alter table public.card_templates
  add column borda_json jsonb not null default '{"ativa":true,"cor":"#e2e8f0","opacidade":1,"espessura":1}'::jsonb;
