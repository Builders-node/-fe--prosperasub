import { useSearchParams } from "react-router-dom";
import { SparklesIcon, Car, UtensilsCrossed, Waves } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { cn } from "@/lib/utils";
import CleaningAnalytics from "./CleaningAnalytics";
import CarRentalsAnalytics from "./CarRentalsAnalytics";
import FoodAnalytics from "./FoodAnalytics";
import BeachClubAnalytics from "./BeachClubAnalytics";
import { DomainEventBusPanel } from "@/components/admin/DomainEventBusPanel";

const SERVICES = [
  { id: "cleaning", label: "Cleaning", icon: SparklesIcon, color: "text-blue-400" },
  { id: "cars", label: "Rental", icon: Car, color: "text-orange-400" },
  { id: "food", label: "Food", icon: UtensilsCrossed, color: "text-orange-400" },
  { id: "beach", label: "Beach Club", icon: Waves, color: "text-cyan-400" },
] as const;
type ServiceId = (typeof SERVICES)[number]["id"];

const Analytics = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("service");
  const service: ServiceId = SERVICES.some((s) => s.id === raw) ? (raw as ServiceId) : "cleaning";

  const setService = (id: ServiceId) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("service", id);
      return next;
    }, { replace: true });

  return (
    <SuperAdminLayout title="Analytics" subtitle="Revenue, retention and volume — pick a service">
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

      {service === "cleaning" && <CleaningAnalytics embedded />}
      {service === "cars" && <CarRentalsAnalytics embedded />}
      {service === "food" && <FoodAnalytics embedded />}
      {service === "beach" && <BeachClubAnalytics embedded />}

      <DomainEventBusPanel />
    </SuperAdminLayout>
  );
};

export default Analytics;
