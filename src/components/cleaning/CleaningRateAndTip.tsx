import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { StarRating } from "@/components/food/StarRating";
import { TipPayment } from "@/components/payment/TipPayment";
import { RateProviderButton } from "@/components/reviews/RateProviderButton";
import { useUserUuid } from "@/hooks/useUserUuid";
import { toast } from "sonner";

interface Props {
  /** The subscription this visit belongs to, recorded with the review. */
  subscriptionId?: string | null;
  bookingId: string;
  customerName?: string | null;
}

export function CleaningRateAndTip({ bookingId, subscriptionId, customerName }: Props) {
  const qc = useQueryClient();
  const userUuid = useUserUuid();

  // The review half used to live here and wrote to `cleaning_reviews`, a table
  // neither the provider page nor the reviews block has ever read — so a
  // customer's stars went nowhere. RateProviderButton owns ratings now; this
  // component keeps the tip, which is genuinely per-visit.

  // ─── Tips total (for the badge) ────────────────────────────────────────────
  const { data: tips = [] } = useQuery({
    queryKey: ["cleaning-tips", bookingId],
    queryFn: async () => {
      const { data } = await supabaseDb.from("cleaning_tips").select("amount_cents").eq("booking_id", bookingId).eq("payment_status", "paid");
      return (data ?? []) as { amount_cents: number }[];
    },
  });
  const tippedCents = tips.reduce((s, t) => s + (t.amount_cents || 0), 0);

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-border bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
        <Star className="h-4 w-4 text-amber-400" /> Rate & tip this cleaning
      </p>

      <RateProviderButton
        service="cleaning_booking"
        itemId={bookingId}
        subscriptionId={subscriptionId ?? ""}
        customerName={customerName}
      />

      <div className="border-t border-border/60" />

      {/* Tip */}
      <TipPayment
        serviceName="Cleaning Tip"
        context="cleaning_tip"
        externalIdPrefix={`cleaning-tip-${bookingId}`}
        adminUrl={`${window.location.origin}/admin/marketplace/subscriptions`}
        customerName={customerName}
        tippedCents={tippedCents}
        heading="Tip the cleaner"
        onRecord={async ({ amountCents, method, paymentRef, pending }) => {
          const { error } = await supabaseDb.from("cleaning_tips").insert({
            user_id: userUuid, booking_id: bookingId, customer_name: customerName ?? null,
            amount_cents: amountCents, payment_status: pending ? "pending" : "paid",
            payment_method: method, payment_reference: paymentRef || null,
          });
          if (error) throw new Error(error.message);
        }}
        onDone={() => qc.invalidateQueries({ queryKey: ["cleaning-tips", bookingId] })}
      />
    </div>
  );
}
