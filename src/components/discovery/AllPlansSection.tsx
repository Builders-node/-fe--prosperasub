import { useMemo, useState } from "react";
import { Skeleton } from "@/components/patterns/Skeleton";
import { useI18n } from "@/i18n";
import { PlanTile, interleaveByProvider, useHomePlans } from "@/components/discovery/homePlans";

/**
 * Every plan on the platform, one card each, at the foot of the home page —
 * the shelf that is complete, under the shelves that are chosen.
 *
 * Interleaved by business so the list reads as the island's offer, not as
 * whichever business listed the most things.
 *
 * Eight first, then the rest on request: the whole catalogue in one go made
 * the home page a scroll with no bottom, and the shelves above lost their
 * point.
 */
const FIRST = 8;
export function AllPlansSection() {
  const { t } = useI18n();
  const { data = [], isLoading } = useHomePlans();
  const plans = useMemo(() => interleaveByProvider(data), [data]);
  const [all, setAll] = useState(false);
  const shown = all ? plans : plans.slice(0, FIRST);

  if (!isLoading && plans.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-heading font-semibold text-foreground">
        {t("discovery.allPlans")}
      </h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[220px]" />)
          : shown.map((plan) => <PlanTile key={plan.id} plan={plan} />)}
      </div>
      {!isLoading && plans.length > FIRST && !all && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="w-full rounded-radius-md bg-inset px-4 py-2.5 text-body font-semibold text-foreground transition-colors hover:bg-segment"
        >
          Show all {plans.length} plans
        </button>
      )}
    </section>
  );
}
