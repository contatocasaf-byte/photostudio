-- Fase 5, Parte 16: formas decorativas no editor de página (e páginas
-- avulsas) — mesmo padrão já usado no card-molde (card_templates.shapes_json).
-- Rodar uma vez no SQL Editor do Supabase.

alter table public.page_templates
  add column formas_json jsonb not null default '[]'::jsonb;
