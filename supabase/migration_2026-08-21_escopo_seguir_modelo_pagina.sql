-- Escopo do vínculo "seguir" entre modelos de página (Fase 5) — pedido
-- do usuário depois de testar: em alguns momentos ele quer reaproveitar
-- SÓ os campos comuns (Banner de Título/Logo/Numeração/Contato/
-- Validade — layout + elementosHabilitados), sem mexer em fundo/
-- ilustrações/formas/margens; em outros, quer tudo (comportamento já
-- existente). 'completo' = comportamento atual (default, preserva o
-- que já foi salvo antes desta migração); 'campos' = só os campos.
alter table public.page_templates
  add column segue_escopo text not null default 'completo' check (segue_escopo in ('completo', 'campos'));
