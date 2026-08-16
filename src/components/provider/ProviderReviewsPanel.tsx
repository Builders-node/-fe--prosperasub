import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MessageSquare, Star } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
          className={cn("h-3.5 w-3.5", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
        />
      ))}
    </span>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
        .select("id, rating, comment, customer_name, service, created_at")
        .eq("provider_id", providerId)
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
              <Star className="h-3 w-3 shrink-0 fill-amber-400/70 text-amber-400/70" />
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber-400"
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
