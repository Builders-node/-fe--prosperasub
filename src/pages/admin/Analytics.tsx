import { useSearchParams } from "react-router-dom";
import { SparklesIcon, Layers, UtensilsCrossed, Waves } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { cn } from "@/lib/utils";
import CleaningAnalytics from "./CleaningAnalytics";
import FoodAnalytics from "./FoodAnalytics";
import BeachClubAnalytics from "./BeachClubAnalytics";
import { DomainEventBusPanel } from "@/components/admin/DomainEventBusPanel";

const SERVICES = [
  // The platform first, because that is the question an admin opens this page
  // with; a single service is the follow-up, not the starting point.
  { id: "all", label: "All services", icon: Layers, color: "text-foreground" },
  { id: "cleaning", label: "Cleaning", icon: SparklesIcon, color: "text-blue-400" },
  { id: "food", label: "Food", icon: UtensilsCrossed, color: "text-orange-400" },
  { id: "beach", label: "Beach Club", icon: Waves, color: "text-cyan-400" },
] as const;
type ServiceId = (typeof SERVICES)[number]["id"];

/** A service's own analytics, named when several are stacked. */
function ServiceBlock({ show, label, children }: {
  show: boolean; label: string; children: React.ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <section className="mb-space-6">
      <h2 className="mb-space-3 text-[20px] font-semibold leading-[26px] tracking-[-0.02em] text-foreground">
        {label}
      </h2>
      {children}
    </section>
  );
}

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
      {/* Service switcher */}
      <div className="mb-space-5 flex flex-wrap gap-space-2">
        {SERVICES.map((s) => {
          const Icon = s.icon;
          const active = s.id === service;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setService(s.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "" : s.color)} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* "All" is every service's own analytics, in order, each under its own
          name — not a fourth set of totals computed a fourth way. The figures
          on this page come from per-service adapters that know what a visit,
          a delivery and a membership are; adding them up here would be a new
          definition of revenue sitting next to the three that already agree
          with the Finance page. */}
      {(service === "all" || service === "cleaning") && (
        <ServiceBlock show={service === "all"} label="Cleaning">
          <CleaningAnalytics embedded />
        </ServiceBlock>
      )}
      {(service === "all" || service === "food") && (
        <ServiceBlock show={service === "all"} label="Food">
          <FoodAnalytics embedded />
        </ServiceBlock>
      )}
      {(service === "all" || service === "beach") && (
        <ServiceBlock show={service === "all"} label="Beach Club">
          <BeachClubAnalytics embedded />
        </ServiceBlock>
      )}

      <DomainEventBusPanel />
    </SuperAdminLayout>
  );
};

export default Analytics;
