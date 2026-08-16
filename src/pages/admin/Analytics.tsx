import { useSearchParams } from "react-router-dom";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import CleaningAnalytics from "./CleaningAnalytics";
import FoodAnalytics from "./FoodAnalytics";
import BeachClubAnalytics from "./BeachClubAnalytics";
import { PlatformAnalytics } from "@/components/admin/analytics/PlatformAnalytics";
import { DomainEventBusPanel } from "@/components/admin/DomainEventBusPanel";

const SERVICES = [
  // The platform first, because that is the question an admin opens this page
  // with; a single service is the follow-up, not the starting point.
  { id: "all", label: "All services" },
  { id: "cleaning", label: "Cleaning" },
  { id: "food", label: "Food" },
  { id: "beach", label: "Beach Club" },
] as const;
type ServiceId = (typeof SERVICES)[number]["id"];

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
          className="h-10 min-w-[220px] rounded-radius-md border border-input bg-card px-3 text-[16px] font-semibold tracking-[-0.02em] text-foreground"
        >
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* "All" is the platform summed once, not the three service pages
          stacked. The rule it sums by lives in lib/analytics/platformRollup.ts
          and is the same one the Overview reduces — so this page cannot become
          a fourth definition of revenue sitting next to the three that already
          agree with Finance. Picking a service swaps in that service's own
          analytics, which know what a visit, a delivery and a court hour are. */}
      {service === "all" && <PlatformAnalytics />}
      {service === "cleaning" && <CleaningAnalytics embedded />}
      {service === "food" && <FoodAnalytics embedded />}
      {service === "beach" && <BeachClubAnalytics embedded />}

      <DomainEventBusPanel />
    </SuperAdminLayout>
  );
};

export default Analytics;
