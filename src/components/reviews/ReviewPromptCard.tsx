import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { accountApi } from "@/integrations/supabase/client";
import { RateProviderButton } from "@/components/reviews/RateProviderButton";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "How did that go?" — asked after the job, not filed under the subscription.
 *
 * The rating widget has lived on every subscription card for months and has
 * collected one review, because a card you open when something is wrong is not
 * where a satisfied customer goes. This asks about work that actually
 * happened: a visit, a delivery or a booked hour that finished in the last
 * month, for a business this customer has not rated. Answer it and it is gone.
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

const WHEN = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return "today";
  if (isYesterday(d)) return "yesterday";
  return `on ${format(d, "MMM d")}`;
};

const NOUN: Record<string, string> = {
  cleaning: "cleaning",
  food: "delivery",
  beach: "visit",
};

export function ReviewPromptCard() {
  const { isAuthenticated } = useAuth();

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

  return (
    <section className="space-y-2 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <h2 className="text-[20px] font-semibold leading-[26px] text-foreground">
        {prompts.length === 1 ? "How did it go?" : "How did they go?"}
      </h2>
      <p className="text-[16px] leading-[22px] text-muted-foreground">
        A rating takes one tap and helps everyone else in Próspera choose.
      </p>
      <div className="space-y-2 pt-1">
        {prompts.map((p) => (
          <RateProviderButton
            key={p.occurrenceId}
            service={(p.service === "food" || p.service === "beach" ? p.service : "cleaning") as "cleaning" | "food" | "beach"}
            itemId={null}
            providerId={p.providerId}
            subscriptionId={p.subscriptionId ?? ""}
            prompt={`${p.providerName} · ${p.itemLabel ? `${p.itemLabel}, ` : ""}${NOUN[p.service] ?? "visit"} ${WHEN(p.happenedAt)}`}
          />
        ))}
      </div>
    </section>
  );
}
