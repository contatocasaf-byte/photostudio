// O Supabase (PostgREST) devolve no máximo 1000 linhas por consulta e
// corta o resto SEM erro, e um .in() com muitos ids estoura o tamanho da
// URL. Estes dois helpers cobrem os dois casos — usar sempre que a
// quantidade de linhas puder passar de algumas centenas.

type QueryResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

const PAGE_SIZE = 1000;

// Busca todas as páginas. A consulta DEVE ter ordenação estável e
// única (inclua `id` como último .order) — sem isso, linhas empatadas
// podem repetir ou sumir na virada de página.
export async function fetchAllPages<T>(build: (from: number, to: number) => QueryResult): Promise<{ data: T[]; error?: string }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error: error.message };
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: all };
}

// Quebra uma lista grande de valores em blocos pequenos pro .in(),
// consultando os blocos em paralelo.
export async function fetchInChunks<T, V>(
  values: V[],
  chunkSize: number,
  build: (chunk: V[]) => QueryResult
): Promise<{ data: T[]; error?: string }> {
  const chunks: V[][] = [];
  for (let i = 0; i < values.length; i += chunkSize) chunks.push(values.slice(i, i + chunkSize));

  const results = await Promise.all(chunks.map((chunk) => build(chunk)));
  const all: T[] = [];
  for (const { data, error } of results) {
    if (error) return { data: all, error: error.message };
    all.push(...((data ?? []) as T[]));
  }
  return { data: all };
}
