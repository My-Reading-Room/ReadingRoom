import "server-only";

/**
 * PostgREST returns at most `max_rows` (1000 on Supabase) per request. The
 * legacy app did a single select, so readers with more than 1000 sessions
 * silently got truncated stats. Page through instead. Queries must have a
 * stable order (e.g. by id) for paging to be correct.
 */
export async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
