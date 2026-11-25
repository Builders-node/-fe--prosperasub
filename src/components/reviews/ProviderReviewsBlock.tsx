import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/food/StarRating";
import { CommentIcon } from "@/components/icons/FigmaIcons";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { tr, dfLocale } from "@/lib/tr";

export type ProviderReviewService = "cleaning" | "beach" | "food" | "plan" | "cars";

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
  /** The business's public answer (Edge routes/provider-customers.ts). */
  reply?: string | null;
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
  // The composer is closed until asked for: a review already left reads as a
  // review, not as a form with its own answer pasted back into it.
  const [composing, setComposing] = useState(false);
  const [comment, setComment] = useState("");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["provider-reviews", providerId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_reviews").select("*")
        .eq("provider_id", providerId)
        // A review an admin took down is off the storefront but still on file.
        .is("hidden_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProviderReviewRow[];
    },
    enabled: !!providerId,
  });

  // Only actual customers can leave a review: anyone with an order from this
  // business, whatever the service. subscriptions_unified carries the
  // UNIVERSAL provider id on every row (cleaning, food, beach, plans, cars),
  // so this is one query — it used to be four, each hopping through a legacy
  // id-space to find the business.
  const { data: isCustomer = false } = useQuery({
    queryKey: ["provider-reviews-is-customer", providerId, uuid, userData?.id],
    enabled: !!providerId && (!!uuid || !!userData?.id),
    queryFn: async () => {
      const ids = [uuid, userData?.id].filter(Boolean) as string[];
      if (!ids.length) return false;
      const { data } = await supabaseDb.from("subscriptions_unified")
        .select("id").eq("provider_id", providerId).in("user_id", ids).limit(1);
      return (data?.length ?? 0) > 0;
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
      if (!uid) throw new Error(tr("Please sign in to leave a review."));
      if (rating < 1) throw new Error(tr("Pick a star rating first."));
      const { error } = await supabaseDb.from("provider_reviews").upsert(
        {
          provider_id: providerId,
          user_id: uid,
          // Never the email: a review is public, and a name-less account used
          // to publish its address on the business's page.
          customer_name: userData?.name || userData?.display_name || null,
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
      toast.success(myReview ? tr("Review updated") : tr("Thanks for your review!"));
      setComposing(false);
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
      toast.success(tr("Review removed"));
      setComposing(false);
      qc.invalidateQueries({ queryKey: ["provider-reviews", providerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultPlaceholder =
    service === "cleaning" ? tr("How was the cleaning? Reliability, thoroughness…")
    : service === "beach"  ? tr("How was your membership experience?")
    : tr("Share how it went…");

  const canPost = isAuthenticated && isCustomer;
  const me = uuid ?? userData?.id;

  // Everyone else's reviews. Mine is drawn once, at the top, not twice.
  // Written reviews lead; a bare star rating says less, so it follows.
  const others = useMemo(
    () =>
      reviews
        .filter((r) => r.id !== myReview?.id)
        .sort((a, b) => Number(!!b.comment?.trim()) - Number(!!a.comment?.trim())),
    [reviews, myReview?.id],
  );
  const shown = expanded ? others : others.slice(0, 3);

  const counts = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: reviews.filter((r) => Math.round(r.rating) === n).length,
  }));

  const cancelEdit = () => {
    setComposing(false);
    setRating(myReview?.rating ?? 0);
    setComment(myReview?.comment ?? "");
  };

  const composer = (
    <div className="rounded-radius-md bg-inset px-4 py-3">
      <p className="text-title font-semibold leading-[22px] text-foreground">
        {myReview ? tr("Edit your review") : tr("Your rating")}
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
        autoFocus
        placeholder={placeholder ?? defaultPlaceholder}
      />
      <div className="mt-3 flex items-center gap-2">
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending || rating < 1}
        >
          {submitMutation.isPending && <Spinner size="sm" className="mr-2" />}
          {myReview ? tr("Save") : tr("Post review")}
        </Button>
        <Button variant="ghost" onClick={cancelEdit}>{tr("Cancel")}</Button>
      </div>
    </div>
  );

  const summary = reviews.length > 0 && (
    <div className="flex items-center gap-4">
      <div className="flex shrink-0 flex-col items-start gap-1">
        <span className="text-[32px] font-semibold leading-none tracking-[-0.64px] text-foreground tabular-nums">
          {avg.toFixed(1)}
        </span>
        <StarRating value={avg} size={14} />
        <span className="text-meta leading-4 text-muted-foreground">
          {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
        </span>
      </div>
      {/* Where the average comes from: a 4.5 from two reviews and from two
          hundred are different promises. */}
      <ul className="flex min-w-0 flex-1 flex-col gap-1" aria-label={tr("Rating breakdown")}>
        {counts.map(({ n, count }) => (
          <li key={n} className="flex items-center gap-2 text-meta leading-4 text-muted-foreground">
            <span className="w-2 shrink-0 text-right tabular-nums">{n}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-inset">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(count / reviews.length) * 100}%` }}
              />
            </span>
            <span className="w-4 shrink-0 tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  // The way in: one button for a client who has not reviewed yet, one quiet
  // line for everyone else — not a standing box explaining a form that isn't there.
  const cta = !isLoading && !myReview && (
    canPost ? (
      !composing && (
        <Button variant="outline" className="w-full" onClick={() => setComposing(true)}>
          <Pencil className="mr-2 h-4 w-4" />{tr("Write a review")}</Button>
      )
    ) : (
      <p className="text-meta leading-4 text-muted-foreground">{tr("Only clients can leave a review.")}</p>
    )
  );

  const list = isLoading ? (
    <div className="h-20 animate-pulse rounded-radius-md bg-inset" />
  ) : reviews.length === 0 ? (
    !composing && (
      <div className="flex flex-col items-center gap-3 rounded-radius-md p-4 text-center">
        <CommentIcon className="h-8 w-8 text-primary" />
        <div className="space-y-1">
          <p className="text-title font-semibold leading-[22px] text-foreground">{tr("No reviews yet")}</p>
          <p className="text-title leading-[22px] text-muted-foreground">{tr("Be the first to share your experience")}</p>
        </div>
      </div>
    )
  ) : (
    <div className="flex flex-col gap-1">
      {myReview && (
        composing ? composer : (
          <ReviewCard
            review={myReview}
            mine
            onEdit={() => setComposing(true)}
            onDelete={() => deleteMutation.mutate(myReview.id)}
          />
        )
      )}
      {shown.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          onDelete={canModerate || (!!me && r.user_id === me) ? () => deleteMutation.mutate(r.id) : undefined}
        />
      ))}
      {/* Three is what the design shows; the rest are one tap away rather
          than a page of scrolling on a plan you have not bought yet. */}
      {others.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-radius-md px-4 py-2 text-center text-title leading-[22px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? tr("Show fewer") : tr("Show all {length} reviews", { length: others.length })}
        </button>
      )}
    </div>
  );

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-heading font-semibold text-foreground">{tr("Reviews")}</h2>
      <div className="flex flex-col gap-4">
        {(summary || cta) && (
          <div className="flex flex-col gap-4">
            {summary}
            {cta}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {composing && !myReview && composer}
          {list}
        </div>
      </div>
    </section>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "C";
}

function ReviewCard({
  review: r,
  mine,
  onEdit,
  onDelete,
}: {
  review: ProviderReviewRow;
  mine?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const name = r.customer_name && !r.customer_name.includes("@") ? r.customer_name : "Customer";
  const when = r.updated_at || r.created_at;
  const text = r.comment?.trim();
  return (
    <div className="flex gap-3 rounded-radius-md bg-inset px-4 py-3">
      <span
        aria-hidden
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
          mine ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-title font-semibold leading-[22px] text-foreground">
            {mine ? tr("Your review") : name}
          </p>
          {mine && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 text-meta font-semibold text-primary hover:underline"
            >{tr("Edit")}</button>
          )}
          <span className="flex-1" />
          {onDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={tr("Review actions")}
                  className="-my-1 -mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />{tr("Delete review")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <StarRating value={r.rating} size={13} />
          {when && (
            <span className="text-meta leading-4 text-muted-foreground">
              {formatDistanceToNowStrict(new Date(when), { locale: dfLocale, addSuffix: true })}
            </span>
          )}
        </div>
        {text && (
          <p className="mt-1.5 text-title leading-[22px] text-muted-foreground">{text}</p>
        )}
        {/* The business's answer, under the review it answers. */}
        {r.reply && (
          <div className="mt-2 border-l-2 border-primary/60 pl-3">
            <p className="text-meta font-semibold text-foreground">{tr("Reply from the business")}</p>
            <p className="mt-0.5 text-body text-muted-foreground">{r.reply}</p>
          </div>
        )}
      </div>
    </div>
  );
}
