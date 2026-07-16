"use client";

import { getPublicUrl } from "@/lib/storage/public-url";
import { defaultConfigForSize, mergeConfig, layoutConfigKey, type ElementConfig, type ElementKey, type LayoutConfig } from "../core/layoutConfig";
import { getLayoutConfigUploadUrl } from "./actions";

// Busca a config salva (JSON sidecar no R2) pro layout e mescla por
// cima dos padrões calculados pro tamanho real do arquivo — mesmo
// comportamento de get_layout_config (core.py:253-276) pra um layout
// que ainda não tem config salva (cai pros padrões, sem erro). Usado
// tanto na tela de Gerar Oferta quanto no Editor de Layout, pra nunca
// duas implementações do "qual config vale" divergirem.
//
// Leitura é um fetch client-side direto, sem server action: o bucket
// já é de leitura pública (mesmo esquema de layouts/*.jpg e
// produtos/*.png) — só a ESCRITA precisa de URL assinada.
export async function loadLayoutConfig(layout: { key: string; width: number; height: number }): Promise<LayoutConfig> {
  const defaults = defaultConfigForSize(layout.width, layout.height);
  try {
    const res = await fetch(`${getPublicUrl(layoutConfigKey(layout.key))}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return defaults;
    const saved = (await res.json()) as Partial<Record<ElementKey, ElementConfig>>;
    return mergeConfig(defaults, saved);
  } catch {
    return defaults;
  }
}

export async function saveLayoutConfig(layoutKey: string, config: LayoutConfig): Promise<{ error?: string }> {
  const configKey = layoutConfigKey(layoutKey);
  const { url, error } = await getLayoutConfigUploadUrl({ configKey });
  if (error || !url) return { error: error ?? "Falha ao gerar URL de upload." };

  const putRes = await fetch(url, {
    method: "PUT",
    body: JSON.stringify(config),
    headers: { "Content-Type": "application/json" },
  });
  if (!putRes.ok) return { error: "Falha ao salvar configuração no R2." };
  return {};
}
