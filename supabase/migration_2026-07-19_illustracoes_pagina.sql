-- Múltiplas ilustrações por página (Fase 5, Parte 13) — rodar uma vez
-- no SQL Editor do Supabase. Já incluído também em catalogos_schema.sql
-- (fonte de verdade completa) para referência futura.
alter table public.page_templates
  add column illustracoes_json jsonb not null default '[]'::jsonb;
