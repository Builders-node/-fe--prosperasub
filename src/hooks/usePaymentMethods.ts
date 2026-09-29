import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { PaymentMethod } from "@/components/payment/PaymentMethodSelector";

/** What a checkout handles unless it says otherwise. */
const DEFAULT_SUPPORTED: PaymentMethod[] = ["lightning", "onchain", "paypal"];

/**
 * Methods that stay OFF until an admin switches them on. The older three
 * default to on when their settings row is missing (that is how they shipped);
 * a new rail must not appear at every till the moment the code deploys.
 */
const OFF_UNLESS_ENABLED = new Set<PaymentMethod>(["crypto_gateway"]);

/**
 * Global payment-method on/off toggles (set in the admin Finance page).
 * Falls back to all methods enabled if the table can't be read.
 *
 * `supported` is what the calling screen can actually take. A checkout that
 * has no panel for a method must not offer its tile, so a new rail is opt-in
 * per screen rather than appearing everywhere at once.
 */
export function usePaymentMethods({ supported = DEFAULT_SUPPORTED }: { supported?: PaymentMethod[] } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: ["payment-method-settings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("payment_method_settings")
        .select("method, enabled, surcharge_percent");
      if (error) throw error;
      return (data ?? []) as { method: string; enabled: boolean; surcharge_percent: number | null }[];
    },
    staleTime: 60_000,
  });

  // Default to enabled when a row is missing or while loading.
  const isEnabled = (m: PaymentMethod) => {
    const row = data?.find((r) => r.method === m);
    return row ? row.enabled : !OFF_UNLESS_ENABLED.has(m);
  };

  /** Configured processing-fee surcharge percent added on top of the base price. */
  const surchargePercent = (m: PaymentMethod): number => {
    const row = data?.find((r) => r.method === m);
    const v = Number(row?.surcharge_percent ?? 0);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  };

  /** Adds the surcharge for `m` on top of `baseCents`. Returns the total in cents (rounded). */
  const addSurchargeCents = (baseCents: number, m: PaymentMethod): number => {
    const pct = surchargePercent(m);
    if (pct <= 0) return baseCents;
    return Math.round(baseCents * (1 + pct / 100));
  };

  const enabled = supported.filter(isEnabled);

  return { enabled, isEnabled, isLoading, surchargePercent, addSurchargeCents };
}
