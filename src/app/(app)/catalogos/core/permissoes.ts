// Mapeamento tipo-de-catálogo -> permissão certa (Catálogo vs. Jornal
// de Ofertas, ver decisão em catalogos/actions.ts) — módulo PLANO, sem
// "use server": o compilador do Next exige que toda função exportada
// de um arquivo "use server" seja async (permissaoParaAcao não é, é
// só um switch síncrono), então essa lógica compartilhada por
// catalogos/actions.ts, produtos/actions.ts e vários page.tsx (Server
// Components) precisa morar fora dali.
import type { createClient } from "@/lib/supabase/server";
import type { PermissaoChave } from "@/lib/auth/permissoes";

// Jornal de Ofertas É um `catalogs` com tipo='jornal_ofertas' — reaproveita
// 100% de sections/card_templates/page_templates/planilhas, só muda em
// capa opcional (sem coluna nova — já era assim pra catálogo comum) e
// período de validade (validade_inicio/validade_fim). Permissões são
// PRÓPRIAS e separadas das de catálogo (pedido do usuário).
export type CatalogTipo = "catalogo" | "jornal_ofertas";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AcaoCatalogo =
  | "criar"
  | "editar"
  | "excluir"
  | "criar_secoes"
  | "editar_secoes"
  | "excluir_secoes"
  | "card_molde"
  | "produtos_secao";

export function permissaoParaAcao(tipo: CatalogTipo, acao: AcaoCatalogo): PermissaoChave {
  if (tipo === "jornal_ofertas") {
    switch (acao) {
      case "criar":
        return "jornais_criar_jornais";
      case "editar":
        return "jornais_editar_jornais";
      case "excluir":
        return "jornais_excluir_jornais";
      case "criar_secoes":
        return "jornais_criar_secoes";
      case "editar_secoes":
        return "jornais_editar_secoes";
      case "excluir_secoes":
        return "jornais_excluir_secoes";
      case "card_molde":
        return "jornais_card_molde";
      case "produtos_secao":
        return "jornais_produtos_secao";
    }
  }
  switch (acao) {
    case "criar":
      return "catalogos_criar_catalogos";
    case "editar":
      return "catalogos_editar_catalogos";
    case "excluir":
      return "catalogos_excluir_catalogos";
    case "criar_secoes":
      return "catalogos_criar_secoes";
    case "editar_secoes":
      return "catalogos_editar_secoes";
    case "excluir_secoes":
      return "catalogos_excluir_secoes";
    case "card_molde":
      return "catalogos_card_molde";
    case "produtos_secao":
      return "catalogos_produtos_secao";
  }
}

export async function getCatalogTipo(supabase: SupabaseServerClient, catalogId: string): Promise<CatalogTipo> {
  const { data } = await supabase.from("catalogs").select("tipo").eq("id", catalogId).maybeSingle();
  return (data?.tipo as CatalogTipo | undefined) ?? "catalogo";
}

// Mesma ideia, mas a partir de uma SEÇÃO (várias actions só recebem
// sectionId, não catalogId) — 1 query só via select relacional do
// Supabase (sections -> catalogs pela FK catalog_id).
export async function getSectionCatalogTipo(supabase: SupabaseServerClient, sectionId: string): Promise<CatalogTipo> {
  const { data } = await supabase.from("sections").select("catalogs(tipo)").eq("id", sectionId).maybeSingle();
  const rel = data?.catalogs as { tipo?: string } | { tipo?: string }[] | null | undefined;
  const tipo = Array.isArray(rel) ? rel[0]?.tipo : rel?.tipo;
  return (tipo as CatalogTipo | undefined) ?? "catalogo";
}
