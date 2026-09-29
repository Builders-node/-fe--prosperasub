import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { useUserUuid } from "./useUserUuid";

/**
 * What this customer has to spend.
 *
 * Earned as cashback on paid orders and from referrals, spent at checkout. It
 * is the same `user_credits` ledger both of those already write to — a second
 * "points" currency would mean a second ledger, a conversion rate and two sets
 * of rules to keep in step, so a hundred bonus is simply a dollar.
 *
 * The ledger itself is service-role only; this reads the single number through
 * `credit_balance_of`. Nothing here decides what may be spent — the database
 * re-checks the balance when the order is written.
 */
export function useBonusBalance() {
  const userUuid = useUserUuid();

  const query = useQuery({
    queryKey: ["bonus-balance", userUuid],
    enabled: !!userUuid,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabaseDb.rpc("credit_balance_of", { p_user_id: userUuid });
      if (error) throw error;
      return Number(data) || 0;
    },
  });

  return {
    balanceCents: query.data ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
