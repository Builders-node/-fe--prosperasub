import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { overlapDays, recognizedCents } from "@/lib/revenueRecognition";
import { revenueSourceFor } from "@/services/revenue";

/**
 * What a provider earned in a window — one definition, used everywhere.
 *
 * There were two. The Money tab recognized revenue straight-line across each
 * subscription's service period (the way the admin's Net Profit page does it);
 * the KPI strip above Overview summed whatever was PAID inside the calendar
 * month. On a three-month plan bought in January the strip said $300 and the
 * tab said $100, on the same screen, and neither was labelled well enough for
 * an owner to tell which question was being answered. Straight-line wins
 * because it is the number the platform reconciles against.
 *
 * There is now one reader rather than four branches. Which table to read, how
 * it is scoped and how a row becomes money is described in
 * `services/revenue.ts` — a service that has said nothing there gets the
 * universal path, which is why adding one still takes no code.
 *
 * Paging matters here: these rows get reduced into a number, and a plain
 * PostgREST select silently stops at 1000 rows (see CLAUDE.md).
 */
export async function fetchEarned(
  sourceKey: string,
  legacyId: string,
  start: Date,
  end: Date,
  providerId?: string,
) {
  const source = revenueSourceFor(sourceKey);

  // `providerId` is the UNIVERSAL id; `legacyId` is the per-service one. Which
  // a vertical needs is the descriptor's business, not this function's — see
  // lib/services/providerBridge for why there are two id spaces at all.
  const scopeId = source.scope === "universal" ? (providerId || legacyId) : legacyId;
  if (!scopeId) return { revenue: 0, units: 0 };

  // Rows a provider owns indirectly — cleaning's, which name a package.
  let indirect: { column: string; ids: string[] } | null = null;
  if (source.resolveScope) {
    indirect = await source.resolveScope(scopeId);
    if (!indirect || indirect.ids.length === 0) return { revenue: 0, units: 0 };
  }

  const rows = await fetchAllRows<any>(() => {
    let q = supabaseDb.from(source.table).select(source.select);
    q = indirect
      ? q.in(indirect.column, indirect.ids)
      : q.eq(source.scopeColumn ?? "provider_id", scopeId);
    return (source.where ? source.where(q) : q).order("id");
  });

  let revenue = 0;
  let units = 0;
  (rows ?? []).forEach((r) => {
    const input = source.toInput(r);
    if (overlapDays(input, start, end) <= 0) return;
    revenue += recognizedCents(input, start, end);
    units += source.units ? source.units(r) : 1;
  });
  return { revenue, units };
}
