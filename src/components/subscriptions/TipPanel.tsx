import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { TipPayment } from "@/components/payment/TipPayment";
import { useUserUuid } from "@/hooks/useUserUuid";

/**
 * The one tip panel, identical on every service.
 *
 * Food and cleaning each had their own tip widget writing to their own table,
 * beach and universal had none, and the redesign had left even the two that
 * existed unreachable. This is the single one: it lives in the "Your purchase"
 * sheet for every service, uses the shared TipPayment for the amount and the
 * rails, and records into one table (`provider_tips`) keyed by the purchase —
 * so a tip is the same act whatever was bought.
 */
export function TipPanel({
  service, subscriptionRef, providerId, providerName, customerName,
}: {
  /** food | cleaning | beach | plan — attribution only; the UI is identical. */
  service: string;
  /** The purchase this tip belongs to (any service's id). */
  subscriptionRef: string;
  providerId?: string | null;
  providerName?: string | null;
  customerName?: string | null;
}) {
  const qc = useQueryClient();
  const userUuid = useUserUuid();
  const key = ["provider-tips", subscriptionRef] as const;

  const { data: tips = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("provider_tips")
        .select("amount_cents")
        .eq("subscription_ref", subscriptionRef)
        .eq("payment_status", "paid");
      return (data ?? []) as { amount_cents: number }[];
    },
  });
  const tippedCents = tips.reduce((s, t) => s + (t.amount_cents || 0), 0);

  return (
    <TipPayment
      serviceName={providerName ? `Tip · ${providerName}` : "Tip"}
      context="provider_tip"
      externalIdPrefix={`tip-${subscriptionRef}`}
      adminUrl={`${window.location.origin}/admin/marketplace/subscriptions`}
      customerName={customerName}
      tippedCents={tippedCents}
      onRecord={async ({ amountCents, method, paymentRef, pending }) => {
        const { error } = await supabaseDb.from("provider_tips").insert({
          user_id: userUuid,
          provider_id: providerId ?? null,
          subscription_ref: subscriptionRef,
          service,
          customer_name: customerName ?? null,
          amount_cents: amountCents,
          payment_status: pending ? "pending" : "paid",
          payment_method: method,
          payment_reference: paymentRef || null,
        });
        if (error) throw new Error(error.message);
      }}
      onDone={() => qc.invalidateQueries({ queryKey: key })}
    />
  );
}
