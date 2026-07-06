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
  bookingId: string;
  customerName?: string | null;
}

export function CleaningRateAndTip({ bookingId, customerName }: Props) {
  const qc = useQueryClient();
  const userUuid = useUserUuid();

  // ─── Review ────────────────────────────────────────────────────────────────
  const { data: myReview } = useQuery({
    queryKey: ["cleaning-review", bookingId, userUuid],
    enabled: !!userUuid,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("cleaning_reviews").select("*")
        .eq("booking_id", bookingId).eq("user_id", userUuid!).maybeSingle();
      return data;
    },
  });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  useEffect(() => { if (myReview) { setRating(myReview.rating || 0); setComment(myReview.comment || ""); } }, [myReview]);

  const saveReview = useMutation({
    mutationFn: async () => {
      if (!rating) throw new Error("Pick a star rating first");
      const { error } = await supabaseDb.from("cleaning_reviews").upsert(
        { booking_id: bookingId, user_id: userUuid, customer_name: customerName ?? null, rating, comment: comment.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: "booking_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Thanks for your review!"); qc.invalidateQueries({ queryKey: ["cleaning-review", bookingId] }); },
    onError: (e: any) => toast.error(e?.message || "Could not save review"),
  });

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

      {/* Review */}
      <div className="space-y-2">
        <StarRating value={rating} onChange={setRating} size={26} />
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="How did the cleaning go? (optional)" />
        <Button size="sm" onClick={() => saveReview.mutate()} disabled={!rating || saveReview.isPending} className="rounded-full">
          {saveReview.isPending && <Spinner size="sm" className="mr-2" />}
          {myReview ? "Update review" : "Save review"}
        </Button>
      </div>

      <div className="border-t border-border/60" />

      {/* Tip */}
      <TipPayment
        serviceName="Cleaning Tip"
        context="cleaning_tip"
        externalIdPrefix={`cleaning-tip-${bookingId}`}
        adminUrl={`${window.location.origin}/admin/cleaning/subscriptions`}
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
