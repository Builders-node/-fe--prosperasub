import { useMemo } from "react";
import { Skeleton } from "@/components/patterns/Skeleton";
import { useI18n } from "@/i18n";
import { PlanTile, interleaveByProvider, useHomePlans } from "@/components/discovery/homePlans";

/**
 * Every plan on the platform, one card each, at the foot of the home page —
 * the shelf that is complete, under the shelves that are chosen.
 *
 * Interleaved by business so the list reads as the island's offer, not as
 * whichever business listed the most things.
 */
export function AllPlansSection() {
  const { t } = useI18n();
  const { data = [], isLoading } = useHomePlans();
  const plans = useMemo(() => interleaveByProvider(data), [data]);

  if (!isLoading && plans.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-heading font-semibold text-foreground">
        {t("discovery.allPlans")}
      </h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[220px]" />)
          : plans.map((plan) => <PlanTile key={plan.id} plan={plan} />)}
      </div>
    </section>
  );
}
