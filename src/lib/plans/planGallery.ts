import { supabaseDb } from "@/integrations/supabase/client";

/**
 * A plan's photographs live in one place, whatever service sells it.
 *
 * `provider_plans.gallery_urls` is that place — the row the plan page, the
 * provider page and the till all read. A legacy plan keeps its own table for
 * everything else, so its pictures are written to its mirror instead of adding
 * an image column to three more tables that are due to be dropped.
 *
 * The mirror trigger does not touch `gallery_urls` — it only ever writes name,
 * description, price, period, status, sort order and visibility — so a gallery
 * saved here survives every later edit of the legacy row.
 */

const asUrls = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((u): u is string => typeof u === "string" && !!u.trim()) : [];

/** The photographs on a legacy plan's mirror, or none. */
export async function fetchPlanGallery(
  sourceServiceKey: string,
  sourcePlanId: string | null | undefined,
): Promise<string[]> {
  if (!sourcePlanId) return [];
  const { data } = await supabaseDb
    .from("provider_plans")
    .select("gallery_urls")
    .eq("source_service_key", sourceServiceKey)
    .eq("source_plan_id", String(sourcePlanId))
    .maybeSingle();
  return asUrls(data?.gallery_urls);
}

/**
 * Write them back.
 *
 * Silent when there is no mirror yet: the trigger creates one on the next save
 * of the legacy row, and a provider who uploaded a photo to a plan that has not
 * mirrored yet should not see an error about a table they have never heard of.
 */
export async function savePlanGallery(
  sourceServiceKey: string,
  sourcePlanId: string | null | undefined,
  urls: string[],
): Promise<void> {
  if (!sourcePlanId) return;
  await supabaseDb
    .from("provider_plans")
    .update({ gallery_urls: asUrls(urls), updated_at: new Date().toISOString() })
    .eq("source_service_key", sourceServiceKey)
    .eq("source_plan_id", String(sourcePlanId));
}
