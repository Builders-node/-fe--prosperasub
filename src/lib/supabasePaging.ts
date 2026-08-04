/**
 * PostgREST applies a server-side row limit (`db-max-rows`, 1000 on Supabase)
 * and returns HTTP 200 with a truncated body. No error, no flag — the caller
 * can't tell a complete result from a clipped one.
 *
 * That's harmless for a list (the admin sees fewer rows). It is NOT harmless
 * for the finance pages, which `reduce()` the rows into a revenue figure: past
 * 1000 subscriptions every total on Dashboard, Finance and Analytics would
 * quietly stop growing, and nothing would look broken.
 *
 * `fetchAllRows` pages until the server returns a short page.
 */

/** Supabase's builder is thenable and single-use, so we need a fresh one per page. */
type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

export interface FetchAllOptions {
  /** Must stay ≤ the server's db-max-rows or the loop can't detect the end. */
  pageSize?: number;
  /**
   * Circuit breaker. A caller that forgets its filters shouldn't be able to pull
   * the whole table into the browser one page at a time — that's a slower,
   * quieter version of the bug this helper exists to fix.
   */
  maxRows?: number;
}

/**
 * Run `makeQuery()` repeatedly with widening `.range()` windows until the whole
 * result set is in hand.
 *
 * `makeQuery` must return a NEW builder each call, with a deterministic order —
 * without an `.order()` the server may return rows in a different order per
 * page, which both duplicates and drops rows across the seams.
 *
 * @example
 *   const subs = await fetchAllRows<Sub>(() =>
 *     supabaseDb.from("cleaning_subscriptions")
 *       .select("id, payment_status, total_price_cents")
 *       .order("id"));
 */
export async function fetchAllRows<T>(
  makeQuery: () => PagedQuery<T>,
  { pageSize = 1000, maxRows = 50_000 }: FetchAllOptions = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    // A short page means the server had nothing more to give.
    if (page.length < pageSize) return all;
  }
  console.warn(`[fetchAllRows] hit the ${maxRows}-row ceiling; result is truncated`);
  return all;
}
