import { useSearchParams } from "react-router-dom";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import CleaningAnalytics from "./CleaningAnalytics";
import FoodAnalytics from "./FoodAnalytics";
import BeachClubAnalytics from "@/legacy/beach/pages/BeachClubAnalytics";
import { PlatformAnalytics } from "@/components/admin/analytics/PlatformAnalytics";
import { RollupServiceAnalytics } from "@/components/admin/analytics/RollupServiceAnalytics";
import { DomainEventBusPanel } from "@/components/admin/DomainEventBusPanel";
import { ROLLUP_SERVICES, type RollupServiceKey } from "@/lib/analytics/platformRollup";

/**
 * The picker lists what the rollup counts, not a hand-kept copy of it — the
 * old hardcoded list was missing Cars and Other services, so the platform
 * table linked to `?service=cars` and the page silently fell back to "All".
 */
const SERVICES = [
  // The platform first, because that is the question an admin opens this page
  // with; a single service is the follow-up, not the starting point.
  { id: "all" as const, label: "All services" },
  ...ROLLUP_SERVICES.map((s) => ({ id: s.key, label: s.label })),
];
type ServiceId = "all" | RollupServiceKey;

/** Services with a bespoke page — they know what a visit or a court hour is. */
const BESPOKE: Partial<Record<ServiceId, React.FC<{ embedded?: boolean }>>> = {
  cleaning: CleaningAnalytics,
  food: FoodAnalytics,
  beach: BeachClubAnalytics,
};

const Analytics = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("service");
  const service: ServiceId = SERVICES.some((s) => s.id === raw) ? (raw as ServiceId) : "all";

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
      <div className="mb-space-5 flex items-center gap-3">
        <label htmlFor="analytics-service" className="text-[16px] leading-[22px] text-muted-foreground">
          Showing
        </label>
        <select
          id="analytics-service"
          value={service}
          onChange={(e) => setService(e.target.value as ServiceId)}
          className="h-10 w-full rounded-radius-md sm:w-auto sm:min-w-[220px] border border-input bg-card px-3 text-[16px] font-semibold tracking-[-0.02em] text-foreground"
        >
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
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

      <DomainEventBusPanel />
    </SuperAdminLayout>
  );
};

export default Analytics;
