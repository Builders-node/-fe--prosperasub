import { DealNote, DealPrice } from "@/components/discounts/DealBits";
import { useDisplayDiscount } from "@/lib/discounts";
import { OfferCard } from "@/components/discovery/homePlans";
import { FavoriteButton } from "@/components/patterns/FavoriteButton";
import { formatUSD } from "@/lib/pricing";
import { FUEL_LABEL, type RentalVehicle } from "../types/carRental";
import { vehiclePath } from "../lib/routes";

/**
 * A car in the fleet, drawn as the same card as every plan on the platform:
 * a square photo with its labels and a round "+" on it, the day rate large
 * under it, then the car's name with the business (or the spec) in grey.
 *
 * The whole card is the target — no Book button on each one: on a list of
 * eight, eight buttons all mean "open this".
 */
export function VehicleCard({ v, showProvider = false }: {
  v: RentalVehicle;
  /**
   * Name the business after the car. Off by default: with one rental
   * company, stamping its name on every card is noise. The fleet turns it on
   * once a second company has cars listed.
   */
  showProvider?: boolean;
}) {
  const specs = [
    `${v.seats} seats`,
    v.transmission === "automatic" ? "Auto" : "Manual",
    FUEL_LABEL[v.fuel_type],
  ].filter(Boolean).join(" · ");
  const deal = useDisplayDiscount({ providerId: v.provider_id, id: v.id, priceCents: v.daily_price_cents });
  return (
    <OfferCard
      href={vehiclePath(v)}
      photos={[v.image_url ?? "", ...(v.gallery_urls ?? [])].filter(Boolean)}
      title={v.name}
      subtitle={showProvider && v.provider?.name ? v.provider.name : specs}
      chips={[...(v.air_conditioning ? ["A/C"] : [])]}
      corner={<FavoriteButton kind="vehicle" id={v.id} name={v.name} variant="overlay" />}
      deal={deal}
      footer={typeof v.daily_price_cents === "number" && v.daily_price_cents > 0 && deal ? (
        <p className="leading-tight">
          <DealPrice deal={deal} cents={v.daily_price_cents} unit="/ day" />
          {deal.note && <><br /><DealNote deal={deal} /></>}
        </p>
      ) : typeof v.daily_price_cents === "number" && v.daily_price_cents > 0 ? (
        <p className="text-[20px] font-bold leading-tight tracking-tight text-foreground">
          {formatUSD(v.daily_price_cents)}
          <span className="text-meta font-medium tracking-normal text-muted-foreground"> / day</span>
        </p>
      ) : null}
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
  // Descriptions were written with the specs tacked on ("… · 5 seats · Auto"),
  // which the card's chips already say — keep only the sentence.
  return v.description ? v.description.split(" · ")[0].trim() || undefined : undefined;
}
