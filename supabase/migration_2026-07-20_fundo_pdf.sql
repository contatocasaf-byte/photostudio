-- Fase 5, Parte 17: upload de PDF como plano de fundo de página, sem
-- perda de qualidade no PDF final. Rodar uma vez no SQL Editor do
-- Supabase.
--
-- fundo_key continua apontando pra uma IMAGEM (PNG rasterizado a
-- partir do PDF, quando o fundo for um PDF) — usada pra desenho normal
-- no editor Konva e na tela de preview, que não sabem renderizar PDF.
-- fundo_pdf_key (novo) aponta pro PDF ORIGINAL, intacto, usado só na
-- hora de gerar o PDF final: em vez de desenhar o fundo como imagem
-- "stretch" (perde qualidade), o backend mescla essa página do PDF
-- original como camada vetorial de base (ver pdf_logic.py no repo
-- brasmam-studio-api). Fundo em imagem comum continua exatamente como
-- antes — fundo_pdf_key fica NULL nesse caso.
alter table public.page_templates
  add column fundo_pdf_key text;
