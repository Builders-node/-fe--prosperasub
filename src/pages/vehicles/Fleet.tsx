import { useMemo, useState } from "react";
import { Search, Car } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Spinner } from "@/components/ui/spinner";
import { VehicleCard } from "@/components/VehicleCard";
import { useVehicles } from "@/hooks/useVehicles";

export default function Fleet() {
  const { data: vehicles = [], isLoading, isError } = useVehicles();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return vehicles;
    return vehicles.filter((v) =>
      [v.name, v.brand, v.model, String(v.year)].some((f) => String(f).toLowerCase().includes(s)),
    );
  }, [vehicles, q]);

  return (
    <div>
      {/* Header panel — one white surface with a 24px bottom edge, search inside. §4d */}
      <div className="rounded-b-radius-lg bg-card shadow-figma">
        <AppContainer className="py-6">
          <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">Rent a car in Próspera</h1>
          <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
            Pick a car, choose your dates, pay in Bitcoin or PayPal.
          </p>
          <div className="relative mt-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the fleet…"
              className="w-full rounded-radius-md bg-inset py-3 pl-9 pr-4 text-[14px] tracking-[-0.02em] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </AppContainer>
      </div>

      <AppContainer className="py-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : isError ? (
          <p className="py-20 text-center text-[14px] text-muted-foreground">Couldn't load the fleet. Please refresh.</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <Car className="mb-3 h-12 w-12 text-muted-foreground/40" />
            <p className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">{q ? "No cars match your search" : "No cars available yet"}</p>
            <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">{q ? "Try a different word." : "Check back soon."}</p>
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-[20px] font-semibold tracking-[-0.4px] text-foreground">Available cars</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((v) => <VehicleCard key={v.id} v={v} />)}
            </div>
          </>
        )}
      </AppContainer>
    </div>
  );
}
