import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { PaymentMethod } from "@/components/payment/PaymentMethodSelector";

const ALL_METHODS: PaymentMethod[] = ["lightning", "onchain", "infinita", "paypal"];

/**
 * Global payment-method on/off toggles (set in the admin Finance page).
 * Falls back to all methods enabled if the table can't be read.
 */
export function usePaymentMethods() {
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
    return row ? row.enabled : true;
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

  const enabled = ALL_METHODS.filter(isEnabled);

  return { enabled, isEnabled, isLoading, surchargePercent, addSurchargeCents };
}
