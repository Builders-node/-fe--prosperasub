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
      description={[v.brand, v.model, v.year].filter(Boolean).join(" · ")}
      photos={[v.image_url ?? "", ...(v.gallery_urls ?? [])]}
      chips={[
        { icon: Users, label: String(v.seats) },
        { icon: Gauge, label: v.transmission === "automatic" ? "Auto" : "Manual" },
        { icon: Fuel, label: FUEL_LABEL[v.fuel_type] },
        ...(v.air_conditioning ? [{ icon: Snowflake, label: "A/C" }] : []),
      ]}
      price={{ cents: v.daily_price_cents, unit: "day" }}
      cta={{ label: "Book", onClick: open }}
      onOpen={open}
    />
  );
}
