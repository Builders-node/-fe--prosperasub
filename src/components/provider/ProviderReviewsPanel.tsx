import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, MessageSquare, Star } from "lucide-react";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatDateHN } from "@/lib/timezone";

/**
 * What customers said, shown to the business they said it about.
 *
 * The platform has been collecting ratings since the reviews were unified onto
 * `provider_reviews`, and the only people who could read them were other
 * customers. A provider saw a single averaged number in the KPI strip and had
 * no way to find out what the 3-star was about.
 *
 * Read-only on purpose. A provider deleting a review they dislike is the one
 * thing that would make every other rating on the platform worthless; removal
 * stays with the admin, who already has it in the public reviews block.
 */

interface ReviewRow {
  id: string;
  reply?: string | null;
  rating: number | null;
  comment: string | null;
  customer_name: string | null;
  service: string | null;
  created_at: string;
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("h-3.5 w-3.5", n <= value ? "fill-primary text-primary" : "text-muted-foreground/30")}
        />
      ))}
    </span>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDateHN(d);
}

/** The business answers in public, under the review. Saved through the API. */
function ReplyBox({ providerId, review }: { providerId: string; review: ReviewRow }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.reply ?? "");
  const save = useMutation({
    mutationFn: async (reply: string) => {
      const { error } = await accountApi(`/account/providers/${providerId}/reviews/${review.id}/reply`, {
        method: "POST", body: JSON.stringify({ reply }),
      });
      if (error) throw error;
    },
    onSuccess: (_d, reply) => {
      toast.success(reply ? "Reply published" : "Reply removed");
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["provider-reviews-owner", providerId] });
      void qc.invalidateQueries({ queryKey: ["provider-reviews", providerId] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the reply"),
  });

  if (!editing) {
    return review.reply ? (
      <div className="mt-1 rounded-radius-md bg-inset p-3">
        <p className="text-meta font-semibold text-foreground">Your reply</p>
        <p className="mt-0.5 text-body text-muted-foreground">{review.reply}</p>
        <button type="button" className="mt-1 text-meta font-semibold text-primary" onClick={() => { setText(review.reply ?? ""); setEditing(true); }}>
          Edit
        </button>
      </div>
    ) : (
      <button type="button" className="text-meta font-semibold text-primary" onClick={() => setEditing(true)}>
        Reply
      </button>
    );
  }
  return (
    <div className="mt-1 space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
        placeholder="Thank you for… / Sorry about… — everyone sees this under the review." />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={save.isPending} disabled={!text.trim() && !review.reply} onClick={() => save.mutate(text.trim())}>
          {text.trim() ? "Publish reply" : "Remove reply"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function ProviderReviewsPanel({ providerId }: { providerId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["provider-reviews-owner", providerId],
    enabled: !!providerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("provider_reviews")
        .select("*")
        .eq("provider_id", providerId)
        .is("hidden_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
  });

  // A business with no reviews yet does not need a box telling it so on its
  // main screen — the KPI strip already shows an empty Rating.
  if (isLoading || reviews.length === 0) return null;

  const rated = reviews.filter((r) => Number.isFinite(Number(r.rating)) && Number(r.rating) > 0);
  const average = rated.length ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length : 0;

  // Highest star first — the shape people read on every other marketplace.
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rated.filter((r) => Math.round(Number(r.rating)) === star).length,
  }));

  const withComment = reviews.filter((r) => r.comment?.trim());
  const shown = expanded ? reviews : reviews.slice(0, 3);

  return (
    <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-[20px] font-semibold leading-[26px] text-foreground">
          What customers said
        </h2>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 sm:w-40 sm:shrink-0">
          <span className="text-[32px] font-semibold tabular-nums leading-none text-foreground">
            {average.toFixed(1)}
          </span>
          <div>
            <Stars value={Math.round(average)} />
            <p className="mt-1 text-xs text-muted-foreground">
              {rated.length} rating{rated.length === 1 ? "" : "s"}
              {withComment.length > 0 && ` · ${withComment.length} written`}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {distribution.map(({ star, count }) => (
            <div key={star} className="flex items-center gap-2">
              <span className="w-3 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{star}</span>
              <Star className="h-3 w-3 shrink-0 fill-primary/70 text-primary/70" />
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-attention"
                  style={{ width: rated.length ? `${(count / rated.length) * 100}%` : "0%" }}
                />
              </div>
              <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-3 border-t border-border/60 pt-4">
        {shown.map((r) => (
          <li key={r.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={Math.round(Number(r.rating) || 0)} />
              <span className="text-sm font-semibold text-foreground">
                {r.customer_name?.trim() || "Customer"}
              </span>
              <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
            </div>
            {r.comment?.trim() ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{r.comment.trim()}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground/70">Rated without a comment</p>
            )}
            <ReplyBox providerId={providerId} review={r} />
          </li>
        ))}
      </ul>

      {reviews.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-primary transition-opacity hover:opacity-80"
        >
          {expanded ? "Show less" : `Show all ${reviews.length}`}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </section>
  );
}
