import { useNavigate } from "react-router-dom";
import { Users, Fuel, Gauge, Snowflake, Building2 } from "lucide-react";
import { PlanCard } from "@/components/patterns/PlanCard";
import { FUEL_LABEL, type RentalVehicle } from "../types/carRental";
import { carPath } from "../lib/routes";

/**
 * A car in the fleet, drawn as the platform's listing row.
 *
 * It used to be a card of its own invention — a full-width 16:10 photo on
 * top, the details beneath, and a Book button on every card. Three departures
 * from every other list in the app, and the last one is the one PlanCard
 * argues against in its own source: on a list of eight, eight buttons all mean
 * "open this" and one of them is always the wrong one to press. The row is the
 * target here too.
 *
 * A car has no rating yet and no "from" price — it has a day rate — so those
 * slots simply go unused rather than being filled with a placeholder.
 */
export function VehicleCard({ v, showProvider = false }: {
  v: RentalVehicle;
  /**
   * Name the business above the title. Off by default: with one rental
   * company, stamping its name on every row is noise. The fleet turns it on
   * once a second company has cars listed.
   */
  showProvider?: boolean;
}) {
  const navigate = useNavigate();
  const open = () => navigate(carPath(`vehicle/${v.id}`));

  return (
    <PlanCard
      title={v.name}
      eyebrow={showProvider && v.provider?.name ? { icon: Building2, text: v.provider.name } : undefined}
      description={vehicleSpecLine(v)}
      photos={[v.image_url ?? "", ...(v.gallery_urls ?? [])]}
      chips={[
        // "5" on its own is a number in search of a noun.
        { icon: Users, label: `${v.seats} seats` },
        { icon: Gauge, label: v.transmission === "automatic" ? "Auto" : "Manual" },
        { icon: Fuel, label: FUEL_LABEL[v.fuel_type] },
        ...(v.air_conditioning ? [{ icon: Snowflake, label: "A/C" }] : []),
      ]}
      // "/ day", matching how every other card on the platform writes a unit.
      price={{ cents: v.daily_price_cents, unit: "/ day" }}
      cta={{ label: "Book", onClick: open }}
      onOpen={open}
    />
  );
}

/**
 * "Brand · Model · Year" — but only when the title has not already said it.
 * Most cars are named exactly "Hyundai Accent 2017", and printing the same
 * three words again directly underneath told the customer nothing twice. When
 * the spec is redundant, the card shows the car's own description instead.
 */
export function vehicleSpecLine(
  v: Pick<RentalVehicle, "name" | "brand" | "model" | "year" | "description">,
): string | undefined {
  const parts = [v.brand, v.model, v.year].filter(Boolean).map(String);
  const name = (v.name ?? "").toLowerCase();
  const redundant = parts.length > 0 && parts.every((p) => name.includes(p.toLowerCase()));
  if (!redundant) return parts.join(" · ") || undefined;
  return v.description ?? undefined;
}
