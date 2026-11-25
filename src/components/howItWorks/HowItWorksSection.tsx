import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import {
  HOW_IT_WORKS_ICONS, cleanSteps, defaultHowItWorks, pickHowItWorks,
  type HowItWorksRow, type HowItWorksStep,
} from "@/lib/howItWorks";
import { cn } from "@/lib/utils";

/** Every "How it works" row of one business — its own and its plans'. Public. */
export function useHowItWorksRows(providerId: string | null | undefined) {
  return useQuery({
    queryKey: ["how-it-works", providerId],
    enabled: !!providerId,
    staleTime: 60_000,
    queryFn: async (): Promise<HowItWorksRow[]> => {
      const { data, error } = await supabaseDb
        .from("provider_how_it_works")
        .select("id,provider_id,plan_id,steps,updated_at")
        .eq("provider_id", providerId!);
      // Before the table exists (or on any read failure) the page simply shows
      // the default — "How it works" is never worth an error on a plan page.
      if (error) return [];
      return ((data ?? []) as any[]).map((r) => ({ ...r, steps: cleanSteps(r.steps) }));
    },
  });
}

/**
 * The public "How it works" — on a plan page (planId given: the plan's own
 * steps first) and on a business page. Falls back to the platform's steps.
 */
export function HowItWorksSection({ providerId, planId, className }: {
  providerId: string | null | undefined;
  planId?: string | null;
  className?: string;
}) {
  const { t } = useI18n();
  const q = useHowItWorksRows(providerId);
  if (!providerId || q.isLoading) return null;
  const picked = pickHowItWorks(q.data, planId);
  return <HowItWorksSteps steps={picked?.steps ?? defaultHowItWorks(t)} title={t("howItWorks.title")} className={className} />;
}

/** The steps themselves — shared by the public pages and the editor's preview. */
export function HowItWorksSteps({ steps, title, className, compact }: {
  steps: HowItWorksStep[];
  title: string;
  className?: string;
  /** The editor's preview column: always one step per row. */
  compact?: boolean;
}) {
  return (
    <section className={cn("space-y-3 rounded-radius-lg bg-card p-4 shadow-figma", className)} aria-label={title}>
      <h2 className="text-heading font-semibold text-foreground">{title}</h2>
      <ol className={cn("grid gap-2", !compact && steps.length > 1 && "sm:grid-cols-2")}>
        {steps.map((s, i) => {
          const Icon = s.icon ? HOW_IT_WORKS_ICONS[s.icon]?.icon : undefined;
          return (
            <li key={i} className="flex items-start gap-3 rounded-radius-md bg-inset p-3">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                {Icon ? <Icon className="h-5 w-5" aria-hidden /> : <span className="text-body font-semibold tabular-nums">{i + 1}</span>}
                {Icon && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-meta font-semibold leading-none text-primary-foreground tabular-nums">
                    {i + 1}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-title font-semibold leading-[22px] text-foreground">{s.title}</p>
                {s.text && <p className="mt-0.5 whitespace-pre-line break-words text-body text-muted-foreground">{s.text}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
