import { useMemo } from "react";
import { useRecentlyViewed } from "@/lib/recentlyViewed";
import { PlanRail, ShelfHeader, planIndex, useHomePlans, type HomePlan } from "@/components/discovery/homePlans";

/**
 * "Recently viewed" — this browser's last plans, on the way back in.
 *
 * Drawn only when there is something on it, so a first visit sees nothing and
 * the page is exactly the shop window it was. (Running subscriptions and saved
 * plans have their own pages — My subscriptions and Favourites — and were
 * taken off the home page on purpose.)
 */
export function ForYouSection() {
  const recent = useRecentlyViewed();
  const { data: plans = [] } = useHomePlans();
  const index = useMemo(() => planIndex(plans), [plans]);

  const viewed = useMemo(() => {
    const seen = new Set<string>();
    const out: HomePlan[] = [];
    for (const id of recent) {
      const p = index.get(id);
      if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
    }
    return out;
  }, [recent, index]);

  if (viewed.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Recently viewed">
      <ShelfHeader title="Recently viewed" />
      <PlanRail plans={viewed.slice(0, 8)} />
    </section>
  );
}
