-- Vínculo "este modelo de página segue aquele" (Capa/Abertura de
-- Seção/Continuação) — mesma ideia já implementada pro card-molde
-- (sections.segue_secao_id): "Reaproveitar" já existia como cópia
-- única; isso adiciona a opção de manter o vínculo, com replicação
-- opcional quando a origem for salva de novo. Uma coluna só serve os
-- 3 tipos (todos são linhas de page_templates).
alter table public.page_templates
  add column segue_template_id uuid references public.page_templates(id) on delete set null;
