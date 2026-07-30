-- Fase 5: continuação personalizável por seção — mesmo padrão já
-- aplicado à Abertura de Seção (Parte 15, ver
-- migration_2026-07-19_abertura_secao_variantes.sql). Rodar uma vez no
-- SQL Editor do Supabase.
--
-- Só "continuacao" ganha múltiplas variantes por catálogo — capa
-- continua 1 por catálogo, sem mudança. Cada seção escolhe qual
-- continuação usar, ou herda o padrão do catálogo se não escolher
-- nenhuma. `page_templates.nome` já existe desde a Parte 15 (coluna
-- genérica, reaproveitada aqui sem mudança nenhuma).

-- Qual variante de "continuacao" é o padrão do catálogo, se a seção
-- não escolher uma própria.
alter table public.catalogs
  add column continuacao_default_id uuid references public.page_templates(id);

-- Qual variante de "continuacao" esta seção usa — null = herda o
-- padrão do catálogo. on delete set null: apagar a variante não quebra
-- a seção, só faz ela voltar a herdar o padrão.
alter table public.sections
  add column continuacao_template_id uuid references public.page_templates(id) on delete set null;
