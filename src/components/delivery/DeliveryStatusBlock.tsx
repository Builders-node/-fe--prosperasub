import { useQuery } from "@tanstack/react-query";
import { Check, MapPin } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { etaText } from "@/lib/delivery/zones";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * "Where is my order?" — inside the purchase sheet (SubscriptionDetailSheet).
 *
 * Four steps the courier moves it through (Admin → Delivery → Deliveries),
 * the address it is going to and the time its zone promises. Renders nothing
 * for a purchase that is not delivered — and before the delivery migration,
 * when the columns are not there to ask about.
 */

const STEPS = [
  { key: "pending", label: "Order received" },
  { key: "assigned", label: "Courier assigned" },
  { key: "on_the_way", label: "On the way" },
  { key: "delivered", label: "Delivered" },
] as const;

interface Row {
  delivery_status: string | null;
  delivery_fee_cents: number | null;
  delivery_point: { line?: string; details?: string | null } | null;
  delivered_at: string | null;
  delivery_zones: { name: string; eta_min_minutes: number | null; eta_max_minutes: number | null } | null;
}

export function DeliveryStatusBlock({ subscriptionId }: { subscriptionId: string | null | undefined }) {
  const q = useQuery({
    queryKey: ["order-delivery", subscriptionId],
    enabled: !!subscriptionId && /^[0-9a-f-]{36}$/i.test(subscriptionId ?? ""),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Row | null> => {
      const { data, error } = await supabaseDb.from("provider_subscriptions")
        .select("delivery_status, delivery_fee_cents, delivery_point, delivered_at, delivery_zones(name, eta_min_minutes, eta_max_minutes)")
        .eq("id", subscriptionId!)
        .not("delivery_zone_id", "is", null)
        .maybeSingle();
      if (error) return null;
      return (data ?? null) as unknown as Row | null;
    },
  });
  const row = q.data;
  if (!row) return null;

  const failed = row.delivery_status === "failed";
  const at = Math.max(0, STEPS.findIndex((s) => s.key === (row.delivery_status ?? "pending")));
  const eta = row.delivery_zones ? etaText(row.delivery_zones.eta_min_minutes, row.delivery_zones.eta_max_minutes) : null;

  return (
    <DialogBlock title="Delivery">
      {failed ? (
        <p className="text-body text-negative">We couldn't deliver it. We'll message you on WhatsApp to arrange it again.</p>
      ) : (
        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const done = i <= at;
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  done ? "bg-primary text-primary-foreground" : "bg-inset text-muted-foreground")}>
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn("text-body", i === at ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {row.delivery_point?.line && (
        <div className="mt-3 flex items-start gap-2 rounded-radius-md bg-inset p-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-body">
            <p className="text-foreground">{row.delivery_point.line}</p>
            {row.delivery_point.details && <p className="text-meta text-muted-foreground">{row.delivery_point.details}</p>}
            <p className="text-meta text-muted-foreground">
              {[row.delivery_zones?.name, eta, row.delivery_fee_cents ? `delivery ${formatUSD(row.delivery_fee_cents)}` : "free delivery"]
                .filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      )}
    </DialogBlock>
  );
}
