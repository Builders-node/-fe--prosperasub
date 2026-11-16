import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Footprints, Home, Truck } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { AddressMapDialog } from "@/components/location/AddressMapDialog";
import { useLocationControl } from "@/contexts/LocationContext";
import { offerDeliveryOf, quoteFor, quoteLine, useDeliveryZones, useProviderZones, type OfferDelivery } from "@/lib/delivery/zones";
import { cn } from "@/lib/utils";

/**
 * "Delivery to West Bay Beach · $5 · 30–60 min" — on a product page, before
 * anyone reaches checkout.
 *
 * Reads the OFFER's ways (a variant inherits them) and answers for the
 * visitor's saved pin — a delivery, or a visit by the business. No pin yet: it
 * asks for one. Tapping it opens the address map, whose bubble answers the
 * same question for wherever the pin is moved. Self-service only: one line
 * saying so. Renders nothing for an offer that names no way.
 */
export function useOfferDelivery(planId: string | null | undefined) {
  return useQuery({
    queryKey: ["offer-delivery", planId],
    enabled: !!planId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OfferDelivery> => {
      // Either id-space: a meal plan's page holds the legacy food_meal_plans id.
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId!);
      const { data: rows, error } = await supabaseDb.from("provider_plans").select("*")
        .or(uuid ? `id.eq.${planId},source_plan_id.eq.${planId}` : `source_plan_id.eq.${planId}`).limit(1);
      const row = (rows ?? [])[0] as any;
      if (error || !row) return offerDeliveryOf(null);
      const own = offerDeliveryOf(row);
      if (own.modes.length || !row.parent_plan_id) return own;
      const { data: parent } = await supabaseDb.from("provider_plans").select("*").eq("id", row.parent_plan_id).maybeSingle();
      return offerDeliveryOf(parent);
    },
  });
}

export function DeliveryRow({ planId, priceCents, className }: { planId: string | null | undefined; priceCents: number; className?: string }) {
  const offerQ = useOfferDelivery(planId);
  const offer = offerQ.data;
  // The way that needs a pin: a delivery if the offer has one, else a visit.
  const pinMode = offer?.modes.includes("delivery") ? "delivery" : offer?.modes.includes("on_site") ? "on_site" : null;
  const zonesQ = useDeliveryZones(pinMode === "delivery");
  const ownQ = useProviderZones(offer?.providerId, !!pinMode);
  const { address } = useLocationControl();
  const [open, setOpen] = useState(false);

  if (!offer || !offer.modes.length) return null;
  const zones = zonesQ.data ?? [];
  const own = ownQ.data ?? [];
  const selfOnly = !pinMode;
  // A delivery with nowhere to deliver to says nothing rather than "not delivered".
  if (pinMode === "delivery" && !offer.ownDeliveryOnly && !own.length && !zones.length && offer.modes.length === 1) return null;
  const quote = pinMode && address ? quoteFor(pinMode, offer, zones, own, address, priceCents) : null;
  const Icon = selfOnly ? Footprints : pinMode === "on_site" ? Home : Truck;
  const ways = offer.modes.map((m) => (m === "self_service" ? "self-service" : m === "on_site" ? "visit" : "delivery"));
  const waysText = ways.length > 1 ? ways.join(" or ").replace(/^./, (c) => c.toUpperCase()) : null;

  if (selfOnly) {
    return (
      <div className={cn("flex items-center gap-3 rounded-radius-md bg-inset p-3", className)}>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="text-body font-semibold text-foreground">Self-service — you go to them</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("flex w-full items-center gap-3 rounded-radius-md bg-inset p-3 text-left transition-colors hover:bg-muted", className)}
      >
        <Icon className={cn("h-5 w-5 shrink-0", quote?.ok ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-foreground">
            {quote ? quoteLine(quote) : waysText ?? (pinMode === "on_site" ? "They come to you" : "Delivered to you")}
          </span>
          <span className={cn("block truncate text-meta", quote && !quote.ok ? "text-negative" : "text-muted-foreground")}>
            {address ? `To ${address.line}` : "Choose your address to see the price and time"}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>
      <AddressMapDialog
        open={open}
        onOpenChange={setOpen}
        title={pinMode === "on_site" ? "Where should they come?" : "Where should we deliver it?"}
        description="Move the map until the pin sits on your door."
        coverage={(pt) => {
          const q = quoteFor(pinMode, offer, zones, own, pt, priceCents);
          return { ok: q.ok, text: quoteLine(q) };
        }}
      />
    </>
  );
}
