import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/food/StarRating";
import { CommentIcon, InfoIcon, StarIcon } from "@/components/icons/FigmaIcons";
import { toast } from "sonner";

export type ProviderReviewService = "cleaning" | "beach" | "food";

interface ProviderReviewRow {
  id: string;
  provider_id: string;
  user_id: string;
  customer_name: string | null;
  rating: number;
  comment: string | null;
  service: ProviderReviewService;
  subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  /** Universal providers.id — NOT the legacy per-service id. */
  providerId: string;
  /** Which archetype this review lives on. Used to tag inserts and to gate the
   *  "isCustomer" query against the correct legacy subscription table. */
  service: ProviderReviewService;
  /** The provider owner's user id. Owners (+ platform admins) may delete any
   *  review. */
  ownerUserId?: string | null;
  /** Optional placeholder shown when the current user is authorized to leave
   *  a review but hasn't yet. Falls back to a service-flavoured default. */
  placeholder?: string;
}

/**
 * Shared reviews block used on every public provider profile page (cleaning /
 * entertainment). Same UX pattern as FoodReviews — customer-only
 * posting, one review per (provider, user), owner/admin can moderate.
 *
 * Reads and writes go to `provider_reviews` (universal). Legacy `food_reviews`
 * table is untouched — food still uses its own component.
 */
export function ProviderReviewsBlock({ providerId, service, ownerUserId, placeholder }: Props) {
  const qc = useQueryClient();
  const { userData, isSuperAdmin, isAuthenticated } = useAuth();
  const uuid = useUserUuid();

  const [rating, setRating] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["provider-reviews", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_reviews").select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProviderReviewRow[];
    },
    enabled: !!providerId,
  });

  // Only actual customers can leave a review. We check the legacy per-service
  // subscription table for a row owned by this user against this universal
  // provider. Path is service-specific because the legacy tables aren't linked
  // to universal providers.id directly — we use the owner_provider_id bridge
  // I added earlier (cleaning_packages/beach_club_plans).
  const { data: isCustomer = false } = useQuery({
    queryKey: ["provider-reviews-is-customer", service, providerId, uuid, userData?.id],
    enabled: !!providerId && (!!uuid || !!userData?.id),
    queryFn: async () => {
      const ids = [uuid, userData?.id].filter(Boolean) as string[];
      if (!ids.length) return false;

      if (service === "cleaning") {
        // cleaning_subscriptions → cleaning_packages.owner_provider_id
        const { data: pkgs } = await supabaseDb.from("cleaning_packages")
          .select("id").eq("owner_provider_id", providerId);
        const pkgIds = (pkgs ?? []).map((p: any) => p.id);
        if (!pkgIds.length) return false;
        const { data } = await supabaseDb.from("cleaning_subscriptions")
          .select("id").in("user_id", ids).in("package_id", pkgIds).limit(1);
        return (data?.length ?? 0) > 0;
      }
      if (service === "beach") {
        // beach_club_subscriptions → beach_club_plans.owner_provider_id
        const { data: plans } = await supabaseDb.from("beach_club_plans")
          .select("id").eq("owner_provider_id", providerId);
        const planIds = (plans ?? []).map((p: any) => p.id);
        if (!planIds.length) return false;
        const { data } = await supabaseDb.from("beach_club_subscriptions")
          .select("id").in("user_id", ids).in("plan_id", planIds).limit(1);
        return (data?.length ?? 0) > 0;
      }
      // food falls back to false (food uses food_reviews, not this block)
      return false;
    },
  });

  const myReview = reviews.find((r) => r.user_id === (uuid ?? userData?.id)) ?? null;
  const canModerate = isSuperAdmin || (!!uuid && !!ownerUserId && uuid === ownerUserId);

  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment ?? "");
    }
  }, [myReview?.id]);

  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const uid = uuid || userData?.id;
      if (!uid) throw new Error("Please sign in to leave a review.");
      if (rating < 1) throw new Error("Pick a star rating first.");
      const { error } = await supabaseDb.from("provider_reviews").upsert(
        {
          provider_id: providerId,
          user_id: uid,
          customer_name: userData?.name || userData?.display_name || userData?.email || null,
          rating,
          comment: comment.trim() || null,
          service,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(myReview ? "Review updated" : "Thanks for your review!");
      qc.invalidateQueries({ queryKey: ["provider-reviews", providerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("provider_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review removed");
      qc.invalidateQueries({ queryKey: ["provider-reviews", providerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultPlaceholder =
    service === "cleaning" ? "How was the cleaning? Reliability, thoroughness…"
    : service === "beach"  ? "How was your membership experience?"
    : "Share how it went…";

  const canPost = isAuthenticated && isCustomer;
  const shown = expanded ? reviews : reviews.slice(0, 3);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 text-[20px] font-semibold tracking-[-0.4px] text-foreground">Reviews</h2>
        {reviews.length > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            <StarIcon className="h-[18px] w-[18px] text-primary" />
            <span className="text-[14px] leading-[18px] tracking-[-0.28px] text-muted-foreground">
              {avg.toFixed(1)}/5 ({reviews.length})
            </span>
          </span>
        )}
      </div>

      {/* The design keeps this note standing rather than hiding it: it explains
          why there is no box to type in, which silence does not. */}
      {!canPost && !isLoading && (
        <div className="flex items-start gap-2 rounded-radius-md bg-inset px-4 py-3">
          <InfoIcon className="h-[22px] w-[22px] shrink-0 text-primary" />
          <p className="flex-1 text-[16px] leading-[22px] tracking-[-0.32px] text-muted-foreground">
            Only clients can leave a review
          </p>
        </div>
      )}

      {canPost && (
        <div className="rounded-radius-md bg-inset px-4 py-3">
          <p className="text-[16px] font-semibold leading-[22px] tracking-[-0.32px] text-foreground">
            {myReview ? "Your review" : "Leave a review"}
          </p>
          <div className="mt-2">
            <StarRating value={rating} onChange={setRating} size={28} />
          </div>
          <Textarea
            className="mt-3"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={placeholder ?? defaultPlaceholder}
          />
          <div className="mt-3 flex items-center gap-2">
            <Button
              className="rounded-radius-md"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || rating < 1}
            >
              {submitMutation.isPending && <Spinner size="sm" className="mr-2" />}
              {myReview ? "Update review" : "Post review"}
            </Button>
            {myReview && (
              <Button
                variant="ghost"
                className="rounded-radius-md text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate(myReview.id)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-20 animate-pulse rounded-radius-md bg-inset" />
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-radius-md p-4 text-center">
          <CommentIcon className="h-8 w-8 text-primary" />
          <div className="space-y-1">
            <p className="text-[16px] font-semibold leading-[22px] tracking-[-0.32px] text-foreground">No reviews</p>
            <p className="text-[16px] leading-[22px] tracking-[-0.32px] text-muted-foreground">
              Be the first to share your experience
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {shown.map((r) => (
              <div key={r.id} className="rounded-radius-md bg-inset px-4 py-3">
                <div className="flex items-start gap-1">
                  <p className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[22px] tracking-[-0.32px] text-foreground">
                    {r.customer_name ?? "Customer"}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    <StarIcon className="h-[18px] w-[18px] text-primary" />
                    <span className="text-[14px] leading-[18px] tracking-[-0.28px] text-muted-foreground">
                      {r.rating}/5
                    </span>
                  </span>
                  {(canModerate || ((uuid || userData?.id) && r.user_id === (uuid ?? userData?.id))) && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(r.id)}
                      className="ml-1 shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Delete review"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {r.comment && (
                  <p className="mt-1 text-[16px] leading-[22px] tracking-[-0.32px] text-muted-foreground">
                    {r.comment}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Three is what the design shows; the rest are one tap away rather
              than a page of scrolling on a plan you have not bought yet. */}
          {reviews.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full rounded-radius-md px-4 py-2 text-center text-[16px] leading-[22px] tracking-[-0.32px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? "Show fewer reviews" : `Show all reviews (${reviews.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
