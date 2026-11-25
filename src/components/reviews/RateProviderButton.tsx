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
import { tr } from "@/lib/tr";

/**
 * Where a rating can be left from.
 *
 * `food` and `cleaning_booking` are new. Before them, food ratings went to
 * `food_reviews` and a cleaning visit's rating to `cleaning_reviews` — two
 * tables nothing reads. The provider page and the reviews block have only ever
 * read `provider_reviews`, so a customer who rated their restaurant saw their
 * stars vanish. One table now, reached from every entry point.
 */
export type Service = "cleaning" | "beach" | "food" | "food_provider" | "cleaning_booking" | "plan";

interface Props {
  service: Service;
  itemId: string | null | undefined;
  subscriptionId: string;
  customerName?: string | null;
  className?: string;
  /**
   * The universal `providers.id`, when the caller already knows it — the
   * review prompt does, because it comes from an occurrence. Skips the
   * id-space lookups below entirely.
   */
  providerId?: string | null;
  /** Overrides the idle line ("How was your cleaning on 14 Aug?"). */
  prompt?: string;
  /**
   * Render nothing until there is a rating to show.
   *
   * Asking is the review prompt's job — it asks once, about a job that
   * actually finished. A subscription card carrying its own "how was it?"
   * asked again on every card, forever, and still collected nothing.
   */
  onlyIfRated?: boolean;
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

/**
 * The universal `providers.id` behind whatever id the caller happens to hold.
 *
 * Three shapes, because the entry points genuinely differ:
 *   - a plan row that already carries `owner_provider_id`
 *   - a food meal plan, which only knows its LEGACY food_providers id and has
 *     to cross the id-space bridge
 *   - a cleaning BOOKING, which is three hops from its provider
 */
async function resolveProviderId(service: Service, itemId: string): Promise<string | null> {
  if (service === "food" || service === "food_provider") {
    // `food` is given a meal plan; `food_provider` is given the legacy
    // food_providers id directly, which is what the subscription page holds.
    let legacyId: string | undefined | null = itemId;
    if (service === "food") {
      const { data: plan } = await supabaseDb
        .from("food_meal_plans").select("provider_id").eq("id", itemId).maybeSingle();
      legacyId = (plan as { provider_id?: string } | null)?.provider_id;
    }
    if (!legacyId) return null;
    const { data: prov } = await supabaseDb
      .from("providers").select("id")
      .eq("source_service_key", "food").eq("source_provider_id", legacyId).maybeSingle();
    return (prov as { id?: string } | null)?.id ?? null;
  }

  if (service === "cleaning_booking") {
    const { data: booking } = await supabaseDb
      .from("cleaning_bookings").select("subscription_id").eq("id", itemId).maybeSingle();
    const subId = (booking as { subscription_id?: string } | null)?.subscription_id;
    if (!subId) return null;
    const { data: sub } = await supabaseDb
      .from("cleaning_subscriptions").select("package_id").eq("id", subId).maybeSingle();
    const pkgId = (sub as { package_id?: string } | null)?.package_id;
    if (!pkgId) return null;
    const { data: pkg } = await supabaseDb
      .from("cleaning_packages").select("owner_provider_id").eq("id", pkgId).maybeSingle();
    return (pkg as { owner_provider_id?: string } | null)?.owner_provider_id ?? null;
  }

  const table =
    service === "cleaning" ? "cleaning_packages" :
                             "beach_club_plans";
  const { data: link } = await supabaseDb
    .from(table).select("owner_provider_id").eq("id", itemId).maybeSingle();
  return (link as { owner_provider_id?: string } | null)?.owner_provider_id ?? null;
}

export function RateProviderButton({
  service, itemId, subscriptionId, customerName, className,
  providerId: knownProviderId, prompt, onlyIfRated = false,
}: Props) {
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
    queryKey: ["my-provider-review-inline", service, itemId, knownProviderId, uid],
    enabled: (!!itemId || !!knownProviderId) && !!uid,
    queryFn: async () => {
      if (!uid) return null;
      const providerId = knownProviderId ?? (itemId ? await resolveProviderId(service, itemId) : null);
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
      if (!uid) throw new Error(tr("Please sign in to leave a review."));
      if (!providerId) throw new Error(tr("Provider not found for this subscription."));
      if (rating < 1) throw new Error(tr("Pick a star rating first."));
      const { error } = await supabaseDb.from("provider_reviews").upsert(
        {
          provider_id: providerId,
          user_id: uid,
          // Never the email — the review is public.
          customer_name: [customerName, userData?.name, userData?.display_name].find((n) => n && !n.includes("@")) ?? null,
          rating,
          comment: comment.trim() || null,
          // The customer-facing service, not the entry point: a rating left
          // from a visit dialog is still a rating of the cleaning provider.
          service:
            service === "cleaning_booking" ? "cleaning"
            : service === "food_provider" ? "food"
            : service,
          subscription_id: subscriptionId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id,user_id" },
      );
      if (error) throw error;
      // A happy customer is offered the business's own Google review page:
      // the business's Google rating is what people see first in Maps and
      // search. select=* so this reads nothing before the column exists.
      if (rating < 4) return null;
      const { data: prov } = await supabaseDb.from("providers").select("*").eq("id", providerId).maybeSingle();
      const url = (prov as { google_review_url?: string | null } | null)?.google_review_url ?? null;
      return url && /^https:\/\//.test(url) ? url : null;
    },
    onSuccess: (googleUrl) => {
      toast.success(myReview ? tr("Review updated") : tr("Thanks for your review!"), googleUrl ? {
        description: tr("Would you share it on Google too? It helps a local business more than anything."),
        duration: 15000,
        action: { label: tr("Review on Google"), onClick: () => window.open(googleUrl, "_blank", "noopener,noreferrer") },
      } : undefined);
      qc.invalidateQueries({ queryKey: ["my-provider-review-inline", service, itemId] });
      qc.invalidateQueries({ queryKey: ["provider-reviews", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-rating-summary", providerId] });
      // The prompt that sent them here has been answered.
      qc.invalidateQueries({ queryKey: ["pending-reviews"] });
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
      toast.success(tr("Review removed"));
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
  if (onlyIfRated && !myReview) return null;
  const idlePrompt = myReview
    ? tr("Your rating · tap to edit")
    : prompt
      ?? (service === "cleaning" ? tr("How was your cleaning?") : tr("How was your visit?"));

  return (
    <>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // An inset row inside a card — 16px radius, not the 24 that
          // `rounded-radius-md` maps to here, and the page's own inset grey.
          "flex items-center justify-between gap-3 rounded-radius-md bg-inset px-3.5 py-3 tracking-[-0.02em]",
          className,
        )}
      >
        <p className={cn(
          "min-w-0 truncate text-[13px] font-semibold",
          myReview ? "text-muted-foreground" : "text-foreground",
        )}>
          {idlePrompt}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); openWithRating(i); }}
              aria-label={(i > 1 ? tr("{i} stars", { i }) : tr("{i} star", { i }))}
              className="p-0.5 transition-transform active:scale-90"
            >
              <Star
                className={cn(
                  "h-5 w-5 transition-colors",
                  i <= displayRating
                    ? "fill-primary text-primary"
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
              <Star className="h-5 w-5 text-attention" />
              {myReview ? tr("Update your review") : tr("Rate this provider")}
            </DialogTitle>
            <DialogDescription>{tr("Your rating helps others on Roatán choose better.")}</DialogDescription>
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
                service === "cleaning" ? tr("How was the cleaning? Reliability, thoroughness…")
                    : tr("How was your membership experience?")
              }
            />
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            {myReview && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />{" "}{tr("Delete")}</Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setOpen(false)}>{tr("Cancel")}</Button>
            <Button
             
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || rating < 1}
            >
              {saveMutation.isPending && <Spinner size="sm" className="mr-2" />}
              {myReview ? tr("Update") : tr("Post review")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
