import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StarRating } from "@/components/food/StarRating";
import { TipPayment } from "@/components/payment/TipPayment";
import { RateProviderButton } from "@/components/reviews/RateProviderButton";
import { useUserUuid } from "@/hooks/useUserUuid";
import { SectionOverline } from "@/components/subscriptions/MySubsPrimitives";
import { toast } from "sonner";

interface Props {
  providerId: string;
  providerName: string;
  subscriptionId: string;
  customerName?: string | null;
}

/**
 * Post-purchase "leave a review + tip your restaurant" panel shown on the
 * food subscription screen. Layout matches the rest of the mobile-first
 * language on this screen: one card per concern (review, tip), borderless
 * inputs, section overline instead of an inline heading.
 */
export function RateAndTip({ providerId, subscriptionId, customerName }: Props) {
  const qc = useQueryClient();
  const userUuid = useUserUuid();

  // The review half used to live here and wrote to `food_reviews`, a table the
  // provider page has never read — a customer's stars went nowhere.
  // RateProviderButton owns ratings now; this component keeps the tip, which is
  // genuinely per-purchase.

  // ─── Tips total (for the badge) ────────────────────────────────────────────
  const { data: tips = [] } = useQuery({
    queryKey: ["food-tips", subscriptionId],
    queryFn: async () => {
      const { data } = await supabaseDb.from("food_tips").select("amount_cents").eq("subscription_id", subscriptionId).eq("payment_status", "paid");
      return (data ?? []) as { amount_cents: number }[];
    },
  });
  const tippedCents = tips.reduce((s, t) => s + (t.amount_cents || 0), 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
        <SectionOverline label="Rate & tip" />
      </div>

      <div className="rounded-radius-lg bg-card p-5">
        <RateProviderButton
          service="food_provider"
          itemId={providerId}
          subscriptionId={subscriptionId}
          customerName={customerName}
        />
      </div>

      {/* Tip — separate card so the two concerns are visually distinct */}
      <div className="rounded-radius-lg bg-card p-5">
        <TipPayment
          serviceName="Food Tip"
          context="food_tip"
          externalIdPrefix={`food-tip-${subscriptionId}`}
          adminUrl={`${window.location.origin}/admin/marketplace/subscriptions`}
          customerName={customerName}
          tippedCents={tippedCents}
          onRecord={async ({ amountCents, method, paymentRef, pending }) => {
            const { error } = await supabaseDb.from("food_tips").insert({
              user_id: userUuid, provider_id: providerId, subscription_id: subscriptionId,
              customer_name: customerName ?? null, amount_cents: amountCents,
              payment_status: pending ? "pending" : "paid", payment_method: method, payment_reference: paymentRef || null,
            });
            if (error) throw new Error(error.message);
          }}
          onDone={() => qc.invalidateQueries({ queryKey: ["food-tips", subscriptionId] })}
        />
      </div>
    </section>
  );
}
