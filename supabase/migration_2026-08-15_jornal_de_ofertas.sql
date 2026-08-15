-- Jornal de Ofertas (novo "tipo" dentro de `catalogs`) — reaproveita
-- 100% da infraestrutura de Catálogos (sections, card_templates,
-- page_templates, catalog_items, planilhas/products) por design: um
-- jornal de ofertas É um catalog com tipo='jornal_ofertas', só muda
-- em duas coisas — capa opcional (já é assim pra catálogo comum, pois
-- a capa só existe se um page_template tipo='capa' for configurado —
-- nenhuma coluna nova precisa disso) e prazo de validade (período).
alter table public.catalogs
  add column tipo text not null default 'catalogo' check (tipo in ('catalogo', 'jornal_ofertas')),
  add column validade_inicio date,
  add column validade_fim date;
