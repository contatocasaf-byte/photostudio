-- Fase 5, Parte 15: abertura de seção personalizável por seção.
-- Rodar uma vez no SQL Editor do Supabase.
--
-- Só "abertura_secao" ganha múltiplas variantes por catálogo (nome +
-- design próprios) — capa/continuação continuam 1 por catálogo, sem
-- mudança nenhuma. Cada seção escolhe qual abertura usar, ou herda o
-- padrão do catálogo se não escolher nenhuma.

-- Rótulo só usado pelas variantes de abertura_secao (demais linhas de
-- page_templates continuam com nome NULL, sem uso).
alter table public.page_templates
  add column nome text;

-- Reaproveita a FK que existia sem uso desde a Parte 3 (zero
-- referências no código até esta parte) — vira literalmente "qual
-- abertura_secao é o padrão do catálogo, se a seção não escolher uma
-- própria".
alter table public.catalogs
  rename column page_template_default_id to abertura_secao_default_id;

-- Qual abertura_secao esta seção usa — null = herda o padrão do
-- catálogo. on delete set null: apagar a variante não quebra a seção,
-- só faz ela voltar a herdar o padrão.
alter table public.sections
  add column abertura_template_id uuid references public.page_templates(id) on delete set null;
