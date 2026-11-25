import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * The two numbers the bonus runs on, as Admin → Promo codes set them.
 *
 *   cashbackPct  — what a paid order gives back, on what was actually paid.
 *   maxSharePct  — how much of one order the balance may cover.
 *
 * `global_settings` is readable by anyone, so this needs no API. The database
 * applies both itself (bonus_earn_on_paid, bonus_spend_on_order); the page
 * only reads them so that what it promises is what the database will do.
 */
export interface BonusRules {
  cashbackPct: number;
  maxSharePct: number;
}

const DEFAULTS: BonusRules = { cashbackPct: 0, maxSharePct: 100 };

export function useBonusRules() {
  const query = useQuery({
    queryKey: ["bonus-rules"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BonusRules> => {
      const { data, error } = await supabaseDb
        .from("global_settings")
        .select("key, value")
        .in("key", ["bonus_cashback_pct", "bonus_max_share_pct"]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, Number(r.value)]));
      const pct = (k: string, d: number) => {
        const n = map.get(k);
        return n != null && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : d;
      };
      return {
        cashbackPct: pct("bonus_cashback_pct", DEFAULTS.cashbackPct),
        maxSharePct: pct("bonus_max_share_pct", DEFAULTS.maxSharePct),
      };
    },
  });
  return query.data ?? DEFAULTS;
}
