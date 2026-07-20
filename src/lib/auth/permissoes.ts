// Fonte única das permissões granulares (Fase 6) — usada tanto pelos
// checkboxes de /usuarios quanto por getCurrentAccess() (access.ts),
// pra nunca ter a mesma chave escrita solta em dois lugares. Adicionar
// uma permissão nova é só adicionar uma entrada aqui — sem SQL novo
// (ver `permissoes_usuario`, tabela EAV).
export type PermissaoChave =
  | "studio_editor"
  | "studio_marca_dagua"
  | "studio_renomeador"
  | "studio_comparador"
  | "ofertas_gerar"
  | "ofertas_lote"
  | "ofertas_layout"
  | "catalogos_gerenciar"
  | "catalogos_modelos_pagina"
  | "catalogos_cards_produtos"
  | "catalogos_galeria"
  | "catalogos_preview_pdf"
  | "criar_usuarios";

export type ModuloChave = "studio" | "ofertas" | "catalogos" | "sistema";

export type PermissaoDef = {
  chave: PermissaoChave;
  modulo: ModuloChave;
  label: string;
};

export const PERMISSOES: PermissaoDef[] = [
  { chave: "studio_editor", modulo: "studio", label: "Editor" },
  { chave: "studio_marca_dagua", modulo: "studio", label: "Marca d'água" },
  { chave: "studio_renomeador", modulo: "studio", label: "Renomeador" },
  { chave: "studio_comparador", modulo: "studio", label: "Comparador de Pastas" },
  { chave: "ofertas_gerar", modulo: "ofertas", label: "Gerar Oferta" },
  { chave: "ofertas_lote", modulo: "ofertas", label: "Gerar em Lote" },
  { chave: "ofertas_layout", modulo: "ofertas", label: "Editor de Layout" },
  // "Gerenciar catálogos" é pré-requisito de entrada no módulo inteiro
  // (decisão do usuário) — sem ela, as outras 4 permissões de
  // catálogos não abrem sozinhas nenhuma tela, mesmo marcadas.
  { chave: "catalogos_gerenciar", modulo: "catalogos", label: "Gerenciar catálogos (criar/editar/excluir catálogo e seções)" },
  { chave: "catalogos_modelos_pagina", modulo: "catalogos", label: "Editar modelos de página (capa, continuação, aberturas, avulsas)" },
  { chave: "catalogos_cards_produtos", modulo: "catalogos", label: "Editar card-molde e produtos da seção" },
  { chave: "catalogos_galeria", modulo: "catalogos", label: "Configurar galeria de fotos" },
  { chave: "catalogos_preview_pdf", modulo: "catalogos", label: "Ver catálogo e baixar PDF" },
  { chave: "criar_usuarios", modulo: "sistema", label: "Criar usuários" },
];

export const MODULO_LABEL: Record<ModuloChave, string> = {
  studio: "Studio de Produtos",
  ofertas: "Gerador de Ofertas",
  catalogos: "Criador de Catálogos",
  sistema: "Sistema",
};

export function permissoesDoModulo(modulo: ModuloChave): PermissaoDef[] {
  return PERMISSOES.filter((p) => p.modulo === modulo);
}
