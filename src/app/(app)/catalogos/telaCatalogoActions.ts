"use server";

import { getCatalog, listSections } from "./actions";
import { listPaginasAvulsas } from "./paginas-avulsas/actions";
import { listAberturaSecaoTemplates, listContinuacaoTemplates } from "./paginas/actions";

// Tudo que a tela de detalhe do catálogo precisa pra abrir, numa chamada só.
// As chamadas de servidor do cliente rodam em fila no Next (uma por vez,
// ~0,9s cada); aqui dentro rodam em paralelo no servidor, então a tela
// abre no tempo da mais lenta em vez da soma das cinco.
export async function carregarTelaCatalogo(catalogId: string) {
  const [catalog, sections, avulsas, abertura, continuacao] = await Promise.all([
    getCatalog(catalogId),
    listSections(catalogId),
    listPaginasAvulsas(catalogId),
    listAberturaSecaoTemplates(catalogId),
    listContinuacaoTemplates(catalogId),
  ]);
  return { catalog, sections, avulsas, abertura, continuacao };
}
