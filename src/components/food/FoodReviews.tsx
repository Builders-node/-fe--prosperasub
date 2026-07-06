import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2, MessageSquare } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/food/StarRating";
import { toast } from "sonner";
import type { FoodReview } from "@/types/food";

interface Props {
  providerId: string;
  /** Restaurant owner's user id — owners (and admins) may delete any review. */
  ownerUserId?: string | null;
}

export function FoodReviews({ providerId, ownerUserId }: Props) {
  const qc = useQueryClient();
  const { userData, isSuperAdmin, isAuthenticated } = useAuth();
  const uuid = useUserUuid();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["food-reviews", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_reviews").select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FoodReview[];
    },
    enabled: !!providerId,
  });

  // Is the current user a customer of this restaurant? (has any subscription)
  const { data: isCustomer = false } = useQuery({
    queryKey: ["food-is-customer", providerId, uuid],
    enabled: !!uuid && !!providerId,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("food_subscriptions").select("id")
        .eq("provider_id", providerId).eq("user_id", uuid!).limit(1);
      return (data?.length ?? 0) > 0;
    },
  });

  const myReview = reviews.find((r) => r.user_id === uuid) ?? null;
  const canModerate = isSuperAdmin || (!!uuid && !!ownerUserId && uuid === ownerUserId);

  // Prefill the form with the user's existing review.
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
      if (!uuid) throw new Error("Please sign in to leave a review.");
      if (rating < 1) throw new Error("Pick a star rating first.");
      const { error } = await supabaseDb.from("food_reviews").upsert(
        {
          provider_id: providerId,
          user_id: uuid,
          customer_name: userData?.name || userData?.display_name || userData?.email || null,
          rating,
          comment: comment.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(myReview ? "Review updated" : "Thanks for your review!");
      qc.invalidateQueries({ queryKey: ["food-reviews", providerId] });
      qc.invalidateQueries({ queryKey: ["food-reviews-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("food_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review removed");
      qc.invalidateQueries({ queryKey: ["food-reviews", providerId] });
      qc.invalidateQueries({ queryKey: ["food-reviews-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

      {/* Write / edit a review — customers only */}
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
            placeholder="Share how the meals and delivery have been…"
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
          Only customers who have subscribed to this restaurant can leave a review.
        </p>
      )}

      {/* Reviews list */}
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
              {(canModerate || (uuid && r.user_id === uuid)) && (
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
