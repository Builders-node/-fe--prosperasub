import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/ui/input";
import { useSearchParams } from "react-router-dom";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import CleaningAnalytics from "./CleaningAnalytics";
import FoodAnalytics from "./FoodAnalytics";
import BeachClubAnalytics from "@/legacy/beach/pages/BeachClubAnalytics";
import { PlatformAnalytics } from "@/components/admin/analytics/PlatformAnalytics";
import { RollupServiceAnalytics } from "@/components/admin/analytics/RollupServiceAnalytics";
import { fetchPlatformRollup, type RollupServiceKey } from "@/lib/analytics/platformRollup";
import { useQuery } from "@tanstack/react-query";
import { PeriodPicker } from "@/components/admin/analytics/PeriodPicker";
import { useRollupPeriod } from "@/hooks/useRollupPeriod";

/**
 * The picker lists the services the rollup counts — Settings → Services, plus
 * Vehicles — read from the data, not a hand-kept copy. It used to list the
 * read model's tables, so "Beach Club" sat where Lifestyle belongs and every
 * new service was one "Other services" line.
 */
type ServiceId = "all" | RollupServiceKey;

/** Services with a bespoke page — they know what a visit or a court hour is. */
const BESPOKE: Record<string, React.FC<{ embedded?: boolean }>> = {
  cleaning: CleaningAnalytics,
  food: FoodAnalytics,
  entertainment: BeachClubAnalytics,
};

/** Links written before services were the grouping. */
const OLD_KEYS: Record<string, string> = { beach: "entertainment", cars: "vehicles", plan: "all" };

const Analytics = () => {
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useRollupPeriod();
  const { data: rollup } = useQuery({ queryKey: ["admin-platform-rollup"], queryFn: fetchPlatformRollup });
  const SERVICES = [
    // The platform first: that is the question this page is opened with.
    { id: "all" as ServiceId, label: "All services" },
    ...(rollup?.services ?? []).map((s) => ({ id: s.key as ServiceId, label: s.label })),
  ];
  const rawParam = params.get("service");
  const raw = rawParam ? (OLD_KEYS[rawParam] ?? rawParam) : null;
  // Until the list has loaded, trust the URL rather than flashing "All".
  const service: ServiceId = raw && (!rollup || SERVICES.some((s) => s.id === raw)) ? raw : "all";

  const setService = (id: ServiceId) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("service", id);
      return next;
    }, { replace: true });

  const Bespoke = service === "all" ? null : BESPOKE[service];

  return (
    <SuperAdminLayout title="Analytics" subtitle="Revenue, retention and volume — the platform, or one service">
      {/* One control, not a row of chips: the list is going to grow with the
          marketplace, and a row that wraps onto a second line is a row that
          stops reading as a single choice. */}
      <div className="mb-space-5 flex flex-wrap items-center gap-3">
        <label htmlFor="analytics-service" className="text-[16px] leading-[22px] text-muted-foreground">
          Showing
        </label>
        <select
          id="analytics-service"
          value={service}
          onChange={(e) => setService(e.target.value as ServiceId)}
          className={cn(fieldClass, "font-semibold sm:w-auto sm:min-w-[220px]")}
        >
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <PeriodPicker value={period} onChange={setPeriod} className="min-w-0 max-w-full" />
      </div>

      {/* "All" is the platform summed once, not the service pages stacked. The
          rule it sums by lives in lib/analytics/platformRollup.ts and is the
          same one the Overview reduces — so this page cannot become another
          definition of revenue sitting next to the ones that already agree
          with Finance. A bespoke page knows what a visit, a delivery and a
          court hour are; every other service is the same rollup, sliced. */}
      {service === "all" && <PlatformAnalytics />}
      {Bespoke && <Bespoke embedded />}
      {service !== "all" && !Bespoke && <RollupServiceAnalytics serviceKey={service} />}

      {/* The domain event bus panel lives on /admin/diagnostics now — it is
          plumbing, and it used to take more of this page than the revenue. */}
    </SuperAdminLayout>
  );
};

export default Analytics;
