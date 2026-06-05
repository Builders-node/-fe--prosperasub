import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Car, Users, Luggage, Zap, Wind, ChevronLeft, ChevronRight as ChevronRightIcon,
  MapPin, Clock, FileText, Gauge,
} from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { HomeHeader } from "@/components/HomeHeader";
import { DesktopHeader } from "@/components/layout/DesktopHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";
import type { RentalVehicle, RentalVehicleImage, RentalDeliverySettings } from "@/types/carRental";

const transmissionLabel = (t: string) => (t === "automatic" ? "Automatic" : "Manual");
const fuelLabel = (f: string) =>
  ({ gasoline: "Gasoline", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid" }[f] ?? f);

const SPECS = (v: RentalVehicle) => [
  { label: "Brand", value: v.brand },
  { label: "Model", value: v.model },
  { label: "Year", value: String(v.year) },
  { label: "Seats", value: `${v.seats} seats` },
  { label: "Transmission", value: transmissionLabel(v.transmission) },
  { label: "Fuel Type", value: fuelLabel(v.fuel_type) },
  { label: "Air Conditioning", value: v.air_conditioning ? "Yes" : "No" },
  { label: "Luggage Capacity", value: `${v.luggage_capacity} bag${v.luggage_capacity !== 1 ? "s" : ""}` },
];

const CarDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [imgIndex, setImgIndex] = useState(0);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["rental-vehicle", id],
    queryFn: async () => {
      const { data: v, error } = await supabaseDb
        .from("rental_vehicles")
        .select("*")
        .eq("id", id)
        .eq("status", "public")
        .single();
      if (error) throw error;

      const { data: imgs } = await supabaseDb
        .from("rental_vehicle_images")
        .select("*")
        .eq("vehicle_id", id)
        .order("sort_order", { ascending: true });

      return { ...(v as RentalVehicle), images: (imgs ?? []) as RentalVehicleImage[] };
    },
    enabled: !!id,
  });

  const { data: delivery } = useQuery({
    queryKey: ["rental-delivery-settings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_delivery_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) return null;
      return data as RentalDeliverySettings;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <HomeHeader title="Car Details" showBackButton onBack={() => navigate("/cars")} />
        <DesktopHeader />
        <main className="market-content py-space-6">
          <div className="h-72 animate-pulse rounded-3xl bg-muted" />
          <div className="mt-4 h-8 w-48 animate-pulse rounded-xl bg-muted" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background">
        <HomeHeader title="Car Details" showBackButton onBack={() => navigate("/cars")} />
        <DesktopHeader />
        <main className="market-content py-space-10 text-center">
          <Car className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-semibold">Vehicle not found</p>
          <Button asChild variant="secondary" className="mt-4">
            <Link to="/cars">Back to fleet</Link>
          </Button>
        </main>
        <BottomNav />
      </div>
    );
  }

  const images = vehicle.images ?? [];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <HomeHeader title={vehicle.name} showBackButton onBack={() => navigate("/cars")} />
      <DesktopHeader />

      <main className="market-content py-space-6 md:py-space-10">
        <div className="grid gap-space-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
          {/* Left column */}
          <div className="space-y-space-6">
            {/* Gallery */}
            <div className="relative overflow-hidden rounded-3xl bg-muted" style={{ aspectRatio: "16/9" }}>
              {images.length > 0 ? (
                <>
                  <img
                    src={images[imgIndex].url}
                    alt={`${vehicle.name} photo ${imgIndex + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setImgIndex((i) => (i - 1 + images.length) % images.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition hover:bg-background"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImgIndex((i) => (i + 1) % images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition hover:bg-background"
                        aria-label="Next image"
                      >
                        <ChevronRightIcon className="h-5 w-5" />
                      </button>
                      {/* Dots */}
                      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                        {images.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setImgIndex(i)}
                            className={`h-1.5 rounded-full transition-all ${i === imgIndex ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                            aria-label={`Go to image ${i + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Car className="h-20 w-20 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setImgIndex(i)}
                    className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition ${i === imgIndex ? "border-primary" : "border-transparent"}`}
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Description */}
            {vehicle.description && (
              <div className="rounded-2xl bg-card p-5">
                <h2 className="mb-3 font-black text-foreground">About this vehicle</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{vehicle.description}</p>
              </div>
            )}

            {/* Specifications */}
            <div className="rounded-2xl bg-card p-5">
              <h2 className="mb-4 flex items-center gap-2 font-black text-foreground">
                <Gauge className="h-5 w-5 text-primary" />
                Specifications
              </h2>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {SPECS(vehicle).map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-[hsl(var(--app-rail))] p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-bold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Delivery section */}
            {delivery && (
              <div className="rounded-2xl bg-card p-5 space-y-4">
                <h2 className="flex items-center gap-2 font-black text-foreground">
                  <MapPin className="h-5 w-5 text-primary" />
                  Delivery & Pickup
                </h2>

                <div className="grid gap-3 sm:grid-cols-2">
                  {delivery.delivery_available && (
                    <InfoBlock
                      icon={MapPin}
                      title="Delivery available"
                      body={delivery.delivery_areas ?? "Contact us for supported areas"}
                    />
                  )}
                  {delivery.pickup_instructions && (
                    <InfoBlock icon={Clock} title="Pickup instructions" body={delivery.pickup_instructions} />
                  )}
                  <InfoBlock
                    icon={Zap}
                    title="Delivery fee"
                    body={delivery.delivery_fee_cents === 0 ? "Free" : formatUSD(delivery.delivery_fee_cents)}
                  />
                  {delivery.terms_and_conditions && (
                    <InfoBlock icon={FileText} title="Terms & conditions" body={delivery.terms_and_conditions} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right column — sticky booking summary */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="text-caption font-bold uppercase tracking-widest text-muted-foreground">
                {vehicle.brand} {vehicle.model} · {vehicle.year}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">{vehicle.name}</h1>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-black tabular-nums text-foreground">
                  {formatUSD(vehicle.daily_price_cents)}
                </span>
                <span className="text-sm text-muted-foreground">/ day</span>
              </div>

              {vehicle.monthly_discount_pct > 0 && (
                <p className="mt-1 text-sm text-green-400">
                  {vehicle.monthly_discount_pct}% discount on monthly rentals
                </p>
              )}

              <div className="mt-6 space-y-2">
                <Button asChild size="lg" className="w-full rounded-full">
                  <Link to={`/cars/${vehicle.id}/book`}>Book Now</Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="w-full rounded-full">
                  <Link to="/cars">Browse other cars</Link>
                </Button>
              </div>

              <div className="mt-6 space-y-2 border-t border-[hsl(var(--app-divider))] pt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rental rules</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Minimum: 1 day</li>
                  <li>• Maximum: 1 month (30 days)</li>
                  {vehicle.monthly_discount_pct > 0 && (
                    <li className="text-green-400">• {vehicle.monthly_discount_pct}% discount for monthly bookings</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function InfoBlock({ icon: Icon, title, body }: { icon: React.FC<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-[hsl(var(--app-rail))] p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      <p className="mt-1 text-sm text-foreground">{body}</p>
    </div>
  );
}

export default CarDetail;
