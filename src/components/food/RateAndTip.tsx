import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { StarRating } from "@/components/food/StarRating";
import { TipPayment } from "@/components/payment/TipPayment";
import { useUserUuid } from "@/hooks/useUserUuid";
import { toast } from "sonner";

interface Props {
  providerId: string;
  providerName: string;
  subscriptionId: string;
  customerName?: string | null;
}

export function RateAndTip({ providerId, providerName, subscriptionId, customerName }: Props) {
  const qc = useQueryClient();
  const userUuid = useUserUuid();

  // ─── Review ────────────────────────────────────────────────────────────────
  const { data: myReview } = useQuery({
    queryKey: ["my-food-review", providerId, userUuid],
    enabled: !!userUuid,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("food_reviews").select("*")
        .eq("provider_id", providerId).eq("user_id", userUuid!).maybeSingle();
      return data;
    },
  });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  useEffect(() => { if (myReview) { setRating(myReview.rating || 0); setComment(myReview.comment || ""); } }, [myReview]);

  const saveReview = useMutation({
    mutationFn: async () => {
      if (!rating) throw new Error("Pick a star rating first");
      const { error } = await supabaseDb.from("food_reviews").upsert(
        { provider_id: providerId, user_id: userUuid, customer_name: customerName ?? null, rating, comment: comment.trim() || null, subscription_id: subscriptionId, updated_at: new Date().toISOString() },
        { onConflict: "provider_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thanks for your review!");
      qc.invalidateQueries({ queryKey: ["my-food-review", providerId] });
      qc.invalidateQueries({ queryKey: ["food-reviews", providerId] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save review"),
  });

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
    <section className="space-y-4 rounded-3xl bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-black tracking-tight">
        <Star className="h-5 w-5 text-amber-400" /> Rate & tip
      </h2>

      {/* Review */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{myReview ? "Your review" : "How was your experience?"}</p>
        <StarRating value={rating} onChange={setRating} size={28} />
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Tell others about the food, delivery, etc. (optional)" />
        <Button onClick={() => saveReview.mutate()} disabled={!rating || saveReview.isPending} className="rounded-full">
          {saveReview.isPending && <Spinner size="sm" className="mr-2" />}
          {myReview ? "Update review" : "Save review"}
        </Button>
      </div>

      <div className="border-t border-border/60" />

      {/* Tip */}
      <TipPayment
        serviceName="Food Tip"
        context="food_tip"
        externalIdPrefix={`food-tip-${subscriptionId}`}
        adminUrl={`${window.location.origin}/admin/food/subscriptions`}
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
    </section>
  );
}
