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
  | "catalogos_criar_catalogos"
  | "catalogos_editar_catalogos"
  | "catalogos_excluir_catalogos"
  | "catalogos_criar_secoes"
  | "catalogos_editar_secoes"
  | "catalogos_excluir_secoes"
  | "catalogos_modelos_pagina"
  | "catalogos_card_molde"
  | "catalogos_produtos_secao"
  | "catalogos_galeria"
  | "catalogos_preview_pdf"
  | "catalogos_excluir_planilhas"
  | "catalogos_atualizar_planilhas"
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
  // "Gerenciar catálogos" (permissão única) foi dividida em 6 — pedido
  // explícito do usuário. Entrada no módulo (ver a lista/abrir um
  // catálogo) mudou de regra junto: antes só essa permissão liberava
  // entrada pras outras 4 (efeito aceito documentado na Fase 6); agora
  // QUALQUER permissão de Catálogos libera entrada (mesmo padrão já
  // usado em Studio/Ofertas) — ver primeiraRotaAcessivel/layout.tsx,
  // que calculam isso dinamicamente via permissoesDoModulo("catalogos"),
  // nunca listando as chaves na mão.
  { chave: "catalogos_criar_catalogos", modulo: "catalogos", label: "Criar catálogos" },
  { chave: "catalogos_editar_catalogos", modulo: "catalogos", label: "Editar catálogos (renomear)" },
  { chave: "catalogos_excluir_catalogos", modulo: "catalogos", label: "Excluir catálogos" },
  { chave: "catalogos_criar_secoes", modulo: "catalogos", label: "Criar seções" },
  { chave: "catalogos_editar_secoes", modulo: "catalogos", label: "Editar seções (inclusive reordenar)" },
  { chave: "catalogos_excluir_secoes", modulo: "catalogos", label: "Excluir seções" },
  { chave: "catalogos_modelos_pagina", modulo: "catalogos", label: "Editar modelos de página (capa, continuação, aberturas, avulsas)" },
  { chave: "catalogos_card_molde", modulo: "catalogos", label: "Editar card-molde da seção" },
  { chave: "catalogos_produtos_secao", modulo: "catalogos", label: "Editar produtos da seção" },
  { chave: "catalogos_galeria", modulo: "catalogos", label: "Configurar galeria de fotos" },
  { chave: "catalogos_preview_pdf", modulo: "catalogos", label: "Ver catálogo e baixar PDF" },
  { chave: "catalogos_excluir_planilhas", modulo: "catalogos", label: "Excluir planilhas de produtos" },
  { chave: "catalogos_atualizar_planilhas", modulo: "catalogos", label: "Atualizar planilhas de produtos (subir arquivo novo)" },
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
