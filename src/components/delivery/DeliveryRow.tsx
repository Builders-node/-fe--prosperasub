import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Truck } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { AddressMapDialog } from "@/components/location/AddressMapDialog";
import { useLocationControl } from "@/contexts/LocationContext";
import { offerDeliveryOf, quoteDelivery, quoteLine, useDeliveryZones, type OfferDelivery } from "@/lib/delivery/zones";
import { cn } from "@/lib/utils";

/**
 * "Delivery to West Bay Beach · $5 · 30–60 min" — on a product page, before
 * anyone reaches checkout.
 *
 * Reads the OFFER's delivery switch (a variant inherits it) and answers for
 * the visitor's saved pin. No pin yet: it asks for one. Tapping it opens the
 * address map, whose bubble answers the same question for wherever the pin is
 * moved. Renders nothing for an offer that is not delivered.
 */
export function useOfferDelivery(planId: string | null | undefined) {
  return useQuery({
    queryKey: ["offer-delivery", planId],
    enabled: !!planId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OfferDelivery> => {
      const { data: row, error } = await supabaseDb.from("provider_plans").select("*").eq("id", planId!).maybeSingle();
      if (error || !row) return offerDeliveryOf(null);
      const own = offerDeliveryOf(row);
      if (own.mode !== "off" || !row.parent_plan_id) return own;
      const { data: parent } = await supabaseDb.from("provider_plans").select("*").eq("id", row.parent_plan_id).maybeSingle();
      return offerDeliveryOf(parent);
    },
  });
}

export function DeliveryRow({ planId, priceCents, className }: { planId: string | null | undefined; priceCents: number; className?: string }) {
  const offerQ = useOfferDelivery(planId);
  const offer = offerQ.data;
  const zonesQ = useDeliveryZones(!!offer && offer.mode !== "off");
  const { address } = useLocationControl();
  const [open, setOpen] = useState(false);

  if (!offer || offer.mode === "off" || !(zonesQ.data ?? []).length) return null;
  const zones = zonesQ.data ?? [];
  const quote = address ? quoteDelivery(offer, zones, address, priceCents) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("flex w-full items-center gap-3 rounded-radius-md bg-inset p-3 text-left transition-colors hover:bg-muted", className)}
      >
        <Truck className={cn("h-5 w-5 shrink-0", quote?.ok ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-foreground">
            {quote ? quoteLine(quote) : offer.mode === "both" ? "Delivery or pickup" : "Delivered by EverySub"}
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
        title="Where should we deliver it?"
        description="Move the map until the pin sits on your door."
        coverage={(pt) => {
          const q = quoteDelivery(offer, zones, pt, priceCents);
          return { ok: q.ok, text: quoteLine(q) };
        }}
      />
    </>
  );
}
