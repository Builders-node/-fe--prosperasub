import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Car, Users, Luggage, Zap, Wind, ChevronRight } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";
import type { RentalVehicle, RentalVehicleImage } from "@/types/carRental";

const transmissionLabel = (t: string) => (t === "automatic" ? "Automatic" : "Manual");
const fuelLabel = (f: string) =>
  ({ gasoline: "Gasoline", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid" }[f] ?? f);

const CarRental = () => {
  const navigate = useNavigate();
  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["rental-vehicles-public"],
    queryFn: async () => {
      const { data: vData, error } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .eq("status", "public")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      if (!vData || vData.length === 0) return [] as (RentalVehicle & { images: RentalVehicleImage[] })[];

      const ids = vData.map((v) => v.id);
      const { data: imgData } = await supabaseDb
        .from("rental_vehicle_images")
        .select("*")
        .in("vehicle_id", ids)
        .order("sort_order", { ascending: true });

      const imgMap: Record<string, RentalVehicleImage[]> = {};
      (imgData ?? []).forEach((img: RentalVehicleImage) => {
        if (!imgMap[img.vehicle_id]) imgMap[img.vehicle_id] = [];
        imgMap[img.vehicle_id].push(img);
      });

      return vData.map((v: RentalVehicle) => ({ ...v, images: imgMap[v.id] ?? [] }));
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title="Car Rental" showBackButton onBack={() => navigate("/discovery")} />
      <DesktopHeader />

      <main className="market-content py-space-6 md:py-space-12">
        {/* Hero */}
        <section className="mb-space-8 md:mb-space-12">
          <div className="rounded-radius-xl bg-card p-space-6 md:p-space-10">
            <div className="inline-flex items-center gap-space-2 rounded-radius-full bg-blue-500/10 px-space-4 py-space-2 text-blue-400">
              <Car className="h-4 w-4" />
              <span className="text-caption uppercase tracking-[0.12em]">Car Rental</span>
            </div>
            <h1 className="mt-space-5 text-page-title">Find Your Car</h1>
            <p className="mt-space-3 max-w-2xl text-body text-muted-foreground">
              Explore Prospera Village and beyond. Quality vehicles at transparent daily rates — no hidden fees.
            </p>
          </div>
        </section>

        {/* Vehicle grid */}
        {isLoading ? (
          <div className="grid gap-space-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[420px] animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : vehicles && vehicles.length > 0 ? (
          <div className="grid gap-space-4 md:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((v) => {
              const thumb = v.images[0]?.url;
              return (
                <article
                  key={v.id}
                  className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card"
                >
                  {/* Image */}
                  <div className="relative h-52 w-full overflow-hidden bg-muted">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={v.name}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Car className="h-16 w-16 text-muted-foreground/30" />
                      </div>
                    )}
                    {v.monthly_discount_pct > 0 && (
                      <span className="absolute right-3 top-3 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white">
                        {v.monthly_discount_pct}% off/mo
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-caption font-bold uppercase tracking-widest text-muted-foreground">
                      {v.brand} {v.model} · {v.year}
                    </p>
                    <h2 className="mt-1 text-lg font-black tracking-tight text-foreground">{v.name}</h2>
                    {v.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{v.description}</p>
                    )}

                    {/* Specs chips */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Chip icon={Users} label={`${v.seats} seats`} />
                      <Chip icon={Luggage} label={`${v.luggage_capacity} bags`} />
                      <Chip icon={Zap} label={fuelLabel(v.fuel_type)} />
                      <Chip icon={Car} label={transmissionLabel(v.transmission)} />
                      {v.air_conditioning && <Chip icon={Wind} label="A/C" />}
                    </div>

                    {/* Price */}
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl font-black tabular-nums text-foreground">
                        {formatUSD(v.daily_price_cents)}
                      </span>
                      <span className="text-sm text-muted-foreground">/ day</span>
                    </div>

                    {/* CTAs */}
                    <div className="mt-5 flex gap-2">
                      <Button asChild variant="secondary" size="sm" className="flex-1 rounded-full">
                        <Link to={`/cars/${v.id}`}>Details</Link>
                      </Button>
                      <Button asChild size="sm" className="flex-1 rounded-full">
                        <Link to={`/cars/${v.id}/book`}>Book Now</Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card py-16 text-center">
            <Car className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No vehicles available</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back soon — our fleet is being prepared.
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

function Chip({ icon: Icon, label }: { icon: React.FC<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export default CarRental;
