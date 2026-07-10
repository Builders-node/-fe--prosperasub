import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { StarRating } from "@/components/food/StarRating";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Service = "cleaning" | "rental" | "beach";

interface Props {
  service: Service;
  itemId: string | null | undefined;
  subscriptionId: string;
  customerName?: string | null;
  className?: string;
}

/**
 * Mobile-first inline star strip that doubles as the review CTA. Idle state
 * shows a compact prompt with 5 outlined stars along the right (Sberbank
 * "Оцените сервис" pattern). Tap ANY star → opens the review dialog with that
 * rating pre-selected, so a single tap already commits the intent. Users who
 * only want to give stars can hit Save immediately; users who want to elaborate
 * type into the textarea first.
 *
 * Lazy — the item→provider lookup only fires when the dialog opens.
 */
export function RateProviderButton({ service, itemId, subscriptionId, customerName, className }: Props) {
  const qc = useQueryClient();
  const { userData } = useAuth();
  const uuid = useUserUuid();
  const uid = uuid || userData?.id || null;

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  // Cheap standing query: existing review used to fill the inline strip.
  // Runs even when the dialog is closed so we can show the current stars
  // filled at rest — same UX as any "your rating" widget.
  const inlineReviewQ = useQuery({
    queryKey: ["my-provider-review-inline", service, itemId, uid],
    enabled: !!itemId && !!uid,
    queryFn: async () => {
      if (!itemId || !uid) return null;
      const table =
        service === "cleaning" ? "cleaning_packages" :
        service === "rental"   ? "rental_vehicles"   :
                                 "beach_club_plans";
      const { data: link } = await supabaseDb
        .from(table).select("owner_provider_id").eq("id", itemId).maybeSingle();
      const providerId = (link?.owner_provider_id as string | null) ?? null;
      if (!providerId) return null;
      const { data: review } = await supabaseDb
        .from("provider_reviews").select("*")
        .eq("provider_id", providerId).eq("user_id", uid).maybeSingle();
      return { providerId, review };
    },
  });

  const providerId = inlineReviewQ.data?.providerId ?? null;
  const myReview = inlineReviewQ.data?.review ?? null;

  // Prefill dialog state whenever it opens.
  useEffect(() => {
    if (open) {
      setRating((r) => (r > 0 ? r : myReview?.rating ?? 0));
      setComment(myReview?.comment ?? "");
    }
  }, [open, myReview?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Please sign in to leave a review.");
      if (!providerId) throw new Error("Provider not found for this subscription.");
      if (rating < 1) throw new Error("Pick a star rating first.");
      const { error } = await supabaseDb.from("provider_reviews").upsert(
        {
          provider_id: providerId,
          user_id: uid,
          customer_name: customerName ?? userData?.name ?? userData?.display_name ?? userData?.email ?? null,
          rating,
          comment: comment.trim() || null,
          service,
          subscription_id: subscriptionId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(myReview ? "Review updated" : "Thanks for your review!");
      qc.invalidateQueries({ queryKey: ["my-provider-review-inline", service, itemId] });
      qc.invalidateQueries({ queryKey: ["provider-reviews", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-rating-summary", providerId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!myReview?.id) return;
      const { error } = await supabaseDb.from("provider_reviews").delete().eq("id", myReview.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review removed");
      qc.invalidateQueries({ queryKey: ["my-provider-review-inline", service, itemId] });
      qc.invalidateQueries({ queryKey: ["provider-reviews", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-rating-summary", providerId] });
      setOpen(false);
      setRating(0);
      setComment("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Tap a specific star → seed the dialog with that rating and open.
  const openWithRating = (n: number) => {
    setRating(n);
    setOpen(true);
  };

  const displayRating = myReview?.rating ?? 0;
  const idlePrompt = myReview
    ? "Your rating · tap to edit"
    : service === "cleaning" ? "How was your cleaning?"
      : service === "rental" ? "How was the rental?"
        : "How was your visit?";

  return (
    <>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-4",
          className,
        )}
      >
        <p className="min-w-0 truncate text-xs font-semibold text-muted-foreground">
          {idlePrompt}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); openWithRating(i); }}
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
              className="p-0.5 transition-transform active:scale-90"
            >
              <Star
                className={cn(
                  "h-5 w-5 transition-colors",
                  i <= displayRating
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-muted-foreground/50",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <Star className="h-5 w-5 text-amber-400" />
              {myReview ? "Update your review" : "Rate this provider"}
            </DialogTitle>
            <DialogDescription>
              Your rating helps others in Próspera choose better.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="flex justify-center py-2">
              <StarRating value={rating} onChange={setRating} size={32} />
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                service === "cleaning" ? "How was the cleaning? Reliability, thoroughness…"
                  : service === "rental" ? "How was the vehicle and pickup process?"
                    : "How was your membership experience?"
              }
            />
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            {myReview && (
              <Button
                variant="ghost"
                className="rounded-full text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || rating < 1}
            >
              {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
              {myReview ? "Update" : "Post review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
