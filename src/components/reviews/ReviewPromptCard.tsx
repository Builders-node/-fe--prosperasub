import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { accountApi } from "@/integrations/supabase/client";
import { RateProviderButton } from "@/components/reviews/RateProviderButton";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "How was it?" — one line per business, above everything else.
 *
 * The first version was a titled card with an explanatory paragraph and one
 * truncated row inside it: three quarters of a phone screen spent asking a
 * single question, and the business's name cut off mid-word. It also grew a
 * whole card per pending ask, so a customer of three services would have
 * scrolled past half a screen of invitations to reach their subscriptions.
 *
 * Now it is what it is: a row. Name, what we did and when, five stars. Two
 * rows at most; the rest sit behind "N more" for whoever wants them. Answering
 * removes the row.
 *
 * The list comes from the server — `service_occurrences` is service-role only,
 * since it holds addresses.
 */

interface Prompt {
  occurrenceId: string;
  providerId: string;
  providerName: string;
  service: string;
  itemLabel: string | null;
  happenedAt: string;
  subscriptionId: string | null;
}

/** How many asks are worth showing before they become a wall. */
const VISIBLE = 2;

const when = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return "today";
  if (isYesterday(d)) return "yesterday";
  return format(d, "MMM d");
};

const noun: Record<string, string> = {
  cleaning: "cleaning",
  food: "delivery",
  beach: "visit",
};

export function ReviewPromptCard() {
  const { isAuthenticated } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const { data: prompts = [] } = useQuery({
    queryKey: ["pending-reviews"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await accountApi("/account/reviews/pending");
      if (error) return [] as Prompt[];
      return (Array.isArray(data) ? data : []) as Prompt[];
    },
  });

  if (!prompts.length) return null;
  const shown = expanded ? prompts : prompts.slice(0, VISIBLE);
  const hidden = prompts.length - shown.length;

  return (
    <section className="space-y-2 rounded-radius-md bg-card p-4 tracking-[-0.02em]">
      {shown.map((p) => (
        <RateProviderButton
          key={p.occurrenceId}
          service={(p.service === "food" || p.service === "beach" ? p.service : "cleaning") as "cleaning" | "food" | "beach"}
          itemId={null}
          providerId={p.providerId}
          subscriptionId={p.subscriptionId ?? ""}
          // The business is never the part that gets cut: what it did and when
          // is the detail, and the detail is what the row can afford to lose.
          prompt={`${p.providerName} · ${noun[p.service] ?? "visit"} ${when(p.happenedAt)}`}
        />
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full py-1 text-[12px] leading-[16px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {hidden} more to rate
        </button>
      )}
    </section>
  );
}
