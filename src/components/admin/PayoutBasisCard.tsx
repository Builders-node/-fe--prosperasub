import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * When a provider's money becomes withdrawable — one switch for the platform.
 *
 * Read by the payout cap on the server (Edge lib/earnings.ts → summarize), so
 * the Withdraw button and the endpoint answer the same. Stored in
 * global_settings.finance_payout_basis; absent means "delivered".
 */
export const PAYOUT_BASIS_KEY = "finance_payout_basis";
type Basis = "delivered" | "paid";

const OPTIONS: Array<{ value: Basis; title: string; body: string }> = [
  {
    value: "delivered",
    title: "As the service is delivered",
    body: "A week paid today becomes withdrawable day by day over that week. If a customer cancels or is refunded, the provider has not already taken the money.",
  },
  {
    value: "paid",
    title: "As soon as the customer pays",
    body: "The whole amount is withdrawable the moment it is paid, renewals included. Faster for providers; a refund later comes out of the platform's pocket.",
  },
];

export function PayoutBasisCard() {
  const qc = useQueryClient();
  const { data: basis = "delivered", isLoading } = useQuery({
    queryKey: ["finance-payout-basis"],
    queryFn: async (): Promise<Basis> => {
      const { data } = await supabaseDb.from("global_settings").select("value").eq("key", PAYOUT_BASIS_KEY).maybeSingle();
      return data?.value === "paid" ? "paid" : "delivered";
    },
  });

  const save = useMutation({
    mutationFn: async (next: Basis) => {
      const { error } = await supabaseDb.from("global_settings")
        .upsert({ key: PAYOUT_BASIS_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === "paid" ? "Providers can withdraw as soon as customers pay" : "Providers withdraw as the service is delivered");
      qc.invalidateQueries({ queryKey: ["finance-payout-basis"] });
      qc.invalidateQueries({ queryKey: ["provider-payout-available"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save"),
  });

  return (
    <Card className="mt-space-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-space-2">
          <Wallet className="h-5 w-5" /> When providers can withdraw
        </CardTitle>
        <CardDescription>
          Applies to every business. The Money tab's "Available to withdraw" and the withdrawal itself follow it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-space-3 md:grid-cols-2">
        {OPTIONS.map((o) => {
          const selected = basis === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={isLoading || save.isPending || selected}
              onClick={() => save.mutate(o.value)}
              className={cn(
                "rounded-radius-lg p-space-4 text-left transition-colors",
                selected ? "bg-primary/15 ring-2 ring-primary" : "bg-muted/50 hover:bg-muted",
              )}
            >
              <p className="font-semibold text-foreground">{o.title}{selected ? " · current" : ""}</p>
              <p className="mt-1 text-sm text-muted-foreground">{o.body}</p>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
