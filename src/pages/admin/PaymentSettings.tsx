import { useState, useEffect } from "react";
import { Bitcoin, Coins, CreditCard, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fieldClass } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { QueryError } from "@/components/patterns/QueryError";
import { tr, trx } from "@/lib/tr";

/**
 * Settings → Payments: which payment methods checkout offers, and the fee
 * each one adds. Moved out of Finance, where a production switch sat at the
 * bottom of a revenue report.
 */
const PAYMENT_METHOD_META = [
  { method: "lightning", label: tr("Lightning"), description: tr("Instant Bitcoin Lightning payments (Blink)."), icon: Zap },
  { method: "onchain", label: tr("On-chain Bitcoin"), description: tr("On-chain BTC via Blink."), icon: Bitcoin },
  { method: "paypal", label: tr("PayPal"), description: tr("Pay with PayPal or card."), icon: CreditCard },
  { method: "crypto_gateway", label: tr("Other crypto"), description: tr("USDT, USDC, ETH, SOL… via the crypto gateway (NOWPayments). Needs NOWPAYMENTS_API_KEY on the backend."), icon: Coins },
] as const;

/** Off until switched on — mirrors usePaymentMethods, so the toggle shows what the till does. */
const OFF_UNLESS_ENABLED = new Set<string>(["crypto_gateway"]);

const methodLabel = (m: string | null) => PAYMENT_METHOD_META.find((x) => x.method === m)?.label ?? m ?? "";

export default function PaymentSettings() {
  const queryClient = useQueryClient();
  const {
    data: methodSettings = [],
    isError: methodSettingsError,
    error: methodSettingsErrorObj,
    refetch: refetchMethodSettings,
  } = useQuery({
    queryKey: ["payment-method-settings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("payment_method_settings").select("method, enabled, surcharge_percent");
      if (error) throw error;
      return (data ?? []) as { method: string; enabled: boolean; surcharge_percent: number | null }[];
    },
  });

  const toggleMethodMutation = useMutation({
    mutationFn: async ({ method, enabled }: { method: string; enabled: boolean }) => {
      const { error } = await supabaseDb
        .from("payment_method_settings")
        .upsert({ method, enabled, updated_at: new Date().toISOString() }, { onConflict: "method" });
      if (error) throw error;
      return { method, enabled };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["payment-method-settings"] });
      // Explicit confirmation — flipping a live payment method silently is scary.
      toast.success(`${methodLabel(r.method)} ${r.enabled ? "turned on" : "turned off"}`);
    },
    onError: (e: Error) => toast.error(e.message || tr("Failed to update payment method")),
  });

  // OFF-confirm — turning a method off pulls it from every checkout mid-flow.
  // Force an AlertDialog so an accidental tap doesn't take a live rail offline.
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const handleToggleMethod = (method: string, next: boolean) => {
    if (!next) { setConfirmDisable(method); return; }
    toggleMethodMutation.mutate({ method, enabled: true });
  };

  const setSurchargeMutation = useMutation({
    mutationFn: async ({ method, percent }: { method: string; percent: number }) => {
      // Preserve `enabled` (row may not exist yet — assume enabled by default).
      const existing = methodSettings.find((r) => r.method === method);
      const { error } = await supabaseDb
        .from("payment_method_settings")
        .upsert(
          { method, enabled: existing?.enabled ?? !OFF_UNLESS_ENABLED.has(method), surcharge_percent: percent, updated_at: new Date().toISOString() },
          { onConflict: "method" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-method-settings"] });
      toast.success(tr("Surcharge updated"));
    },
    onError: (e: Error) => toast.error(e.message || tr("Failed to update surcharge")),
  });

  const isMethodEnabled = (method: string) => {
    const row = methodSettings.find((r) => r.method === method);
    return row ? row.enabled : !OFF_UNLESS_ENABLED.has(method);
  };
  const methodSurcharge = (method: string) => {
    const row = methodSettings.find((r) => r.method === method);
    return Number(row?.surcharge_percent ?? 0);
  };


  return (
    <SuperAdminLayout title={tr("Payments")} subtitle={tr("Which payment methods checkout offers, and the fee each adds")}>
            <section className="rounded-radius-md bg-card">
              <div className="flex flex-col gap-space-2 p-space-6">
                <h3 className="text-panel-title flex items-center gap-space-2">
                  <CreditCard className="h-5 w-5" />{tr("Payment methods")}</h3>
                <p className="type-body text-muted-foreground">{tr("Turn a method on or off. When off, it's hidden from every checkout on the platform.")}</p>
              </div>
              <div className="divide-y divide-border/60 p-0">
                {/* Each toggle reads its state out of this list, so a failed fetch
                    would draw every method in its default position — a settings
                    screen stating a configuration that is not the one in
                    production, on the screen where you would go to change it. */}
                {methodSettingsError && (
                  <div className="p-space-4">
                    <QueryError
                      compact
                      title={tr("Couldn't load payment method settings")}
                      error={methodSettingsErrorObj}
                      onRetry={() => void refetchMethodSettings()}
                    />
                  </div>
                )}
                {!methodSettingsError && PAYMENT_METHOD_META.map(({ method, label, description, icon: Icon }) => {
                  const enabled = isMethodEnabled(method);
                  const surcharge = methodSurcharge(method);
                  return (
                    <div key={method} className="flex flex-col gap-3 px-space-5 py-space-4 sm:flex-row sm:items-center sm:gap-space-4">
                      <div className="flex min-w-0 flex-1 items-center gap-space-4">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md ${enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground">{label}</p>
                          <p className="text-sm text-muted-foreground">{description}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center justify-end gap-3 pl-[56px] sm:pl-0">
                        <div className="flex items-center gap-1.5" title={tr("Extra fee added on top of the price for this method")}>
                          <label className="text-xs text-muted-foreground">{tr("Fee")}</label>
                          <SurchargeInput
                            method={method}
                            initial={surcharge}
                            disabled={setSurchargeMutation.isPending}
                            saving={setSurchargeMutation.isPending && setSurchargeMutation.variables?.method === method}
                            onCommit={(percent) => {
                              if (percent !== surcharge) setSurchargeMutation.mutate({ method, percent });
                            }}
                          />
                        </div>
                        <Badge variant="secondary" className={enabled ? "bg-positive/15 text-positive dark:text-positive" : ""}>
                          {enabled ? tr("On") : tr("Off")}
                        </Badge>
                        <Switch
                          checked={enabled}
                          disabled={toggleMethodMutation.isPending}
                          onCheckedChange={(v) => handleToggleMethod(method, v)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
      <AlertDialog open={!!confirmDisable} onOpenChange={(o) => !o && setConfirmDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trx("Turn off {methodLabel}?", { methodLabel: methodLabel(confirmDisable) })}</AlertDialogTitle>
            <AlertDialogDescription>{trx("Customers won't be able to pay with {methodLabel} once this is off. In-flight checkouts on this method will fail. You can turn it back on at any time.", { methodLabel: methodLabel(confirmDisable) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDisable) toggleMethodMutation.mutate({ method: confirmDisable, enabled: false });
                setConfirmDisable(null);
              }}
            >{tr("Disable")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
}

/**
 * The per-method fee, saved with an explicit button.
 *
 * It used to save on blur: tabbing through the page changed the price in
 * every checkout. Now the change is previewed on a $100 order and saved only
 * when asked.
 */
function SurchargeInput({
  method,
  initial,
  disabled,
  saving,
  onCommit,
}: {
  method: string;
  initial: number;
  disabled?: boolean;
  saving?: boolean;
  onCommit: (percent: number) => void;
}) {
  const [value, setValue] = useState<string>(String(initial ?? 0));
  useEffect(() => { setValue(String(initial ?? 0)); }, [initial, method]);
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
  const dirty = valid && n !== Number(initial ?? 0);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) onCommit(n); if (e.key === "Escape") setValue(String(initial ?? 0)); }}
            disabled={disabled}
            aria-invalid={!valid}
            className={cn(fieldClass, "w-[80px] pl-3 pr-6 text-right tabular-nums")}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
        {dirty && (
          <Button size="sm" onClick={() => onCommit(n)} loading={saving} loadingText={tr("Saving…")}>{tr("Save")}</Button>
        )}
      </div>
      {dirty && (
        <p className="text-meta text-muted-foreground">{trx("A $100 order → customer pays {formatUSD}", { formatUSD: formatUSD(Math.round(10000 * (1 + n / 100))) })}</p>
      )}
      {!valid && <p className="text-meta text-negative">{tr("0 to 100")}</p>}
    </div>
  );
}
