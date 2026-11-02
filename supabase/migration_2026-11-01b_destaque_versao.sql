-- Versão do card de DESTAQUE de cada item — coluna própria, pra marcar/desmarcar
-- um produto como destaque NUNCA mexer em card_template_versao (a versão do card
-- padrão que o item já tinha). Aditiva: coluna nula, não altera nenhuma linha.
-- Rodar depois de migration_2026-11-01_card_destaque.sql.
alter table public.catalog_items
  add column if not exists destaque_versao integer;
