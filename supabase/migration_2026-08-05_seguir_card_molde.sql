-- Vínculo "esta seção segue aquela" no card-molde (rodar uma vez no
-- Supabase). Ao salvar o card-molde de uma seção que tem outras
-- seções apontando pra ela via segue_secao_id, o usuário pode optar
-- por replicar a atualização pra essas seguidoras automaticamente
-- (cada uma continua com sua própria cadeia de versões em
-- card_templates — replicar só insere uma versão nova na seção
-- seguidora, nunca compartilha a linha).
--
-- on delete set null: apagar a seção de origem não apaga a
-- seguidora, só desfaz o vínculo (ela some da lista de "quem segue"
-- de ninguém, mas continua existindo normalmente).
alter table public.sections
  add column segue_secao_id uuid references public.sections(id) on delete set null;
