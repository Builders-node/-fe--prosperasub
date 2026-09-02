import { useMemo, useState } from "react";
import { Search, Car } from "lucide-react";
import { AppContainer } from "@/components/layout/AppContainer";
import { Spinner } from "@/components/ui/spinner";
import { VehicleCard } from "@/components/VehicleCard";
import { useVehicles } from "@/hooks/useVehicles";

export default function Fleet() {
  const { data: vehicles = [], isLoading, isError } = useVehicles();
  const [q, setQ] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);

  /**
   * The businesses with a car listed right now.
   *
   * Derived from the fleet rather than fetched, so a rental company that has
   * been approved but has not added a car yet does not appear as an empty
   * filter — a chip that leads to nothing is worse than no chip.
   */
  const providers = useMemo(() => {
    const seen = new Map<string, string>();
    vehicles.forEach((v) => {
      if (v.provider?.id && v.provider.name) seen.set(v.provider.id, v.provider.name);
    });
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [vehicles]);

  // One company renting cars is the current state, and naming it on every card
  // and offering a filter of one would be chrome around a non-choice.
  const manyProviders = providers.length > 1;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (providerId && v.provider?.id !== providerId) return false;
      if (!s) return true;
      return [v.name, v.brand, v.model, String(v.year), v.provider?.name]
        .some((f) => String(f ?? "").toLowerCase().includes(s));
    });
  }, [vehicles, q, providerId]);

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

      {manyProviders && (
        <AppContainer className="pt-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <ProviderChip label="All" active={providerId === null} onClick={() => setProviderId(null)} />
            {providers.map((p) => (
              <ProviderChip
                key={p.id}
                label={p.name}
                active={providerId === p.id}
                onClick={() => setProviderId(p.id)}
              />
            ))}
          </div>
        </AppContainer>
      )}

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
            <h2 className="mb-3 text-[20px] font-semibold tracking-[-0.4px] text-foreground">
              {providerId ? providers.find((p) => p.id === providerId)?.name ?? "Available cars" : "Available cars"}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((v) => <VehicleCard key={v.id} v={v} showProvider={manyProviders} />)}
            </div>
          </>
        )}
      </AppContainer>
    </div>
  );
}

/** The marketplace's own chip: colour is the state, no border, no weight change. */
function ProviderChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
        active ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
