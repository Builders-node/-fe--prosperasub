import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, MessageSquare } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/food/StarRating";
import { toast } from "sonner";

export type ProviderReviewService = "cleaning" | "rental" | "beach" | "food";

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
 * rental / entertainment). Same UX pattern as FoodReviews — customer-only
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
  // I added earlier (cleaning_packages/rental_vehicles/beach_club_plans).
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
      if (service === "rental") {
        // rental_bookings → rental_vehicles.owner_provider_id
        const { data: vehicles } = await supabaseDb.from("rental_vehicles")
          .select("id").eq("owner_provider_id", providerId);
        const vehicleIds = (vehicles ?? []).map((v: any) => v.id);
        if (!vehicleIds.length) return false;
        const { data } = await supabaseDb.from("rental_bookings")
          .select("id").in("user_id", ids).in("vehicle_id", vehicleIds).limit(1);
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
    : service === "rental" ? "How was the vehicle and pickup process?"
    : service === "beach"  ? "How was your membership experience?"
    : "Share how it went…";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black tracking-tight text-foreground">Reviews</h2>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2">
            <StarRating value={avg} />
            <span className="text-sm font-bold text-foreground">{avg.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">({reviews.length})</span>
          </div>
        )}
      </div>

      {isAuthenticated && isCustomer && (
        <div className="rounded-3xl bg-card p-5">
          <p className="font-bold text-foreground">{myReview ? "Your review" : "Leave a review"}</p>
          <div className="mt-3">
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
              className="rounded-full"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || rating < 1}
            >
              {submitMutation.isPending && <Spinner size="sm" className="mr-2" />}
              {myReview ? "Update review" : "Post review"}
            </Button>
            {myReview && (
              <Button
                variant="ghost"
                className="rounded-full text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate(myReview.id)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      {isAuthenticated && !isCustomer && !isLoading && (
        <p className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
          Only customers who have used this provider can leave a review.
        </p>
      )}

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-12 text-center">
          <MessageSquare className="mb-3 h-9 w-9 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No reviews yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Be the first to share your experience.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card divide-y divide-border/60">
          {reviews.map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                {(r.customer_name ?? "?")[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-bold text-foreground">{r.customer_name ?? "Customer"}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <StarRating value={r.rating} className="mt-0.5" size={14} />
                {r.comment && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{r.comment}</p>}
              </div>
              {(canModerate || ((uuid || userData?.id) && r.user_id === (uuid ?? userData?.id))) && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(r.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Delete review"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
