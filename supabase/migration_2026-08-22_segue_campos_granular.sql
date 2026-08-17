-- Escopo GRANULAR do vínculo "seguir" entre modelos de página — pedido
-- do usuário depois de testar o escopo binário completo/campos
-- (migração anterior, 2026-08-21): em vez de só "tudo" ou "só os 5
-- campos fixos", ele quer marcar EXATAMENTE quais partes replicar —
-- cada campo individual (banner_titulo/logo/numeracao/contato/
-- validade) mais margens/fundo/ilustrações/formas, cada um marcável
-- independente. Substitui a coluna segue_escopo ('completo'/'campos')
-- por uma lista de partes (text[]).
alter table public.page_templates
  add column if not exists segue_campos text[] not null default array[
    'banner_titulo', 'logo', 'numeracao', 'contato', 'validade',
    'margens', 'fundo', 'ilustracoes', 'formas'
  ];

-- Migra dados já gravados com o escopo antigo, se a coluna existir
-- (só existe se a migração 2026-08-21 já tiver sido rodada).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'page_templates' and column_name = 'segue_escopo'
  ) then
    update public.page_templates
    set segue_campos = case
      when segue_escopo = 'campos' then array['banner_titulo', 'logo', 'numeracao', 'contato', 'validade']
      else array['banner_titulo', 'logo', 'numeracao', 'contato', 'validade', 'margens', 'fundo', 'ilustracoes', 'formas']
    end;
    alter table public.page_templates drop column segue_escopo;
  end if;
end $$;
