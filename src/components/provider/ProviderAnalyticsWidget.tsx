import { useQuery } from "@tanstack/react-query";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { analyticsFor } from "@/services/analytics";

/**
 * Where the workspace header's numbers come from.
 *
 * Stats (per service):
 *  • Active subs / bookings   — total live customer relationships
 *  • Upcoming (7 days)        — what's about to happen this week
 *  • Rating                   — average of provider_reviews (if any)
 *
 * Where the numbers come from differs per vertical, because each legacy table
 * has its own shape (see CLAUDE.md) — that is described in
 * services/analytics.ts rather than branched on here.
 */

interface Props {
  /** Universal `providers.id` — used for reviews lookup. */
  providerId: string;
  /** Legacy per-service provider id — used to filter service tables. */
  legacyId: string;
  /** Which legacy service this provider belongs to. */
  sourceKey: string;
}

/**
 * Active customer relationships and what is coming in the next week.
 *
 * Exported because the workspace header shows the same customer count above
 * the tabs. It shares this function AND its query key, so the number in the
 * header and the number in the Overview strip are one fetch and cannot drift.
 *
 * Which reader answers is the vertical's business, not this file's — see
 * services/analytics.ts.
 */
export async function fetchProviderStats(sourceKey: string, legacyId: string, providerId = "") {
  return analyticsFor(sourceKey)({ providerId, legacyId });
}

async function fetchRating(universalProviderId: string) {
  // Rating averages the numeric rating column. Exclude rows with NULL rating
  // so a data-entry blank doesn't drag the mean to zero. Provider_reviews are
  // hard-deleted, so no soft-delete filter needed.
  const { data } = await supabaseDb
    .from("provider_reviews")
    .select("rating")
    .eq("provider_id", universalProviderId)
    .not("rating", "is", null);
  if (!data?.length) return { avg: null as number | null, count: 0 };
  const nums = data
    .map((r: any) => Number(r.rating))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return { avg: null as number | null, count: 0 };
  const sum = nums.reduce((s, n) => s + n, 0);
  return { avg: sum / nums.length, count: nums.length };
}

/**
 * The four figures a provider is measured by, for the KPI card in the
 * workspace header.
 *
 * This used to render its own strip of four icon-plated cards under the tabs —
 * uppercase micro-labels, values in black weight, a tint per metric. The
 * header above it then showed two of the same numbers in the redesign's type.
 * The strip is gone; what is left is where the numbers come from.
 */
export function useProviderKpis({ providerId, legacyId, sourceKey }: Props) {
  const stats = useQuery({
    queryKey: ["provider-analytics", sourceKey, legacyId, providerId],
    queryFn: () => fetchProviderStats(sourceKey, legacyId, providerId),
    staleTime: 60_000,
  });
  const rating = useQuery({
    queryKey: ["provider-rating", providerId],
    // Without this the first render fires `provider_id=eq.` with an empty id,
    // which PostgREST rejects as an invalid uuid — a red 400 on every workspace
    // open, and one more failure to look past when a real one appears.
    enabled: !!providerId,
    queryFn: () => fetchRating(providerId),
    staleTime: 60_000,
  });
  return {
    active: stats.data?.active ?? 0,
    upcoming: stats.data?.upcoming ?? 0,
    rating: rating.data?.avg ?? null,
    ratingCount: rating.data?.count ?? 0,
    isPending: stats.isPending,
    // A failed fetch is not "zero customers". Callers render "—" for it.
    isError: stats.isError,
  };
}
