import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Bitcoin, Coins, CreditCard, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { TabPills } from "@/components/admin/TabPills";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabaseDb } from "@/integrations/supabase/client";
import { FinanceBreakdown } from "@/components/admin/FinanceBreakdown";
import { NetProfitPanel } from "@/components/admin/NetProfitPanel";
import { ProviderPayoutsPanel } from "@/components/admin/ProviderPayoutsPanel";
import { formatUSD } from "@/lib/pricing";
import { fetchPlatformRollup } from "@/lib/analytics/platformRollup";
import { useTabParam } from "@/hooks/useTabParam";
import { FinanceRangePicker, useFinanceRange } from "@/components/admin/finance/FinanceRange";
import { QueryError } from "@/components/patterns/QueryError";

const PAYMENT_METHOD_META = [
  { method: "lightning", label: "Lightning", description: "Instant Bitcoin Lightning payments (Blink).", icon: Zap },
  { method: "onchain", label: "On-chain Bitcoin", description: "On-chain BTC via Blink.", icon: Bitcoin },
  { method: "paypal", label: "PayPal", description: "Pay with PayPal or card.", icon: CreditCard },
  { method: "crypto_gateway", label: "Other crypto", description: "USDT, USDC, ETH, SOL… via the crypto gateway (NOWPayments). Needs NOWPAYMENTS_API_KEY on the backend.", icon: Coins },
] as const;

/** Off until switched on — mirrors usePaymentMethods, so the toggle shows what the till does. */
const OFF_UNLESS_ENABLED = new Set<string>(["crypto_gateway"]);

const FINANCE_TABS = ["payments", "profit", "payouts"] as const;

const AdminPayments = () => {
  const queryClient = useQueryClient();

  // The headline figures are the platform rollup — the same function, and the
  // same cache entry, the Analytics page reads, and the same arithmetic the
  // Dashboard's Revenue tile sums. This page used to reduce three legacy tables
  // of its own and label the result "all services" while missing cars and
  // every universal-only plan.
  const {
    data: rollup,
    isError: rollupError,
    error: rollupErrorObj,
    refetch: refetchRollup,
  } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });
  // Sales MADE in the chosen period, at full price — the sales rule. The
  // breakdown below spreads the same sales over their service period, so the
  // two can differ for the same month; each says which it is.
  const { start: rangeStart, end: rangeEnd, label: rangeLabel } = useFinanceRange();
  const inRange = rollup
    ? rollup.rows.filter((r) => {
        if (!r.paid || r.status === "cancelled" || !r.createdAt) return false;
        const t = Date.parse(r.createdAt);
        return t >= rangeStart.getTime() && t <= rangeEnd.getTime();
      })
    : [];
  const paidSales = inRange.length;
  const soldCents = inRange.reduce((t, r) => t + r.valueCents, 0);

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
      toast.success(`${r.method} ${r.enabled ? "enabled" : "disabled"}`);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update payment method"),
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
      toast.success("Surcharge updated");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update surcharge"),
  });

  const isMethodEnabled = (method: string) => {
    const row = methodSettings.find((r) => r.method === method);
    return row ? row.enabled : !OFF_UNLESS_ENABLED.has(method);
  };
  const methodSurcharge = (method: string) => {
    const row = methodSettings.find((r) => r.method === method);
    return Number(row?.surcharge_percent ?? 0);
  };

  // Reading Commission and refreshing should not drop you back on Payments.
  // The value stays `profit` so links to the old Net Profit tab still land.
  const [financeTab, setFinanceTab] = useTabParam(FINANCE_TABS);

  return (
    <SuperAdminLayout title="Finance" subtitle="Payments, commission and payouts across every service">
      <TabPills
        className="mb-space-4"
        value={financeTab}
        onChange={setFinanceTab}
        tabs={[
          { value: "payments", label: "Payments" },
          { value: "profit", label: "Commission" },
          { value: "payouts", label: "Payouts" },
        ]}
      />
      {/* One period for Payments and Commission; Payouts is a ledger, not a period. */}
      {financeTab !== "payouts" && <FinanceRangePicker className="mb-space-4" />}

      {financeTab === "payments" && (
        <>
          {/* Three headline tiles — same flat pattern as the Dashboard so a
              navigation switch between /admin/dashboard and /admin/payments
              doesn't feel like two different apps. */}
          {rollupError ? (
            <QueryError
              compact
              title="Couldn't load the revenue totals"
              error={rollupErrorObj}
              onRetry={() => void refetchRollup()}
            />
          ) : (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <FinanceTile label="Paid sales" value={rollup ? String(paidSales) : "—"} hint={`Made ${rangeLabel.startsWith("this") ? rangeLabel : `in ${rangeLabel}`}`} />
              <FinanceTile label="Awaiting payment" value={rollup ? String(rollup.totals.awaitingPayment) : "—"} hint="Right now · every service"
                warning={(rollup?.totals.awaitingPayment ?? 0) > 0} className="col-span-1" />
              <FinanceTile label="Sold" value={rollup ? formatUSD(soldCents) : "—"}
                hint="Full price of those sales. The breakdown below spreads each over its service period" accent className="col-span-2 md:col-span-1" />
            </section>
          )}

          {/* Cross-service finance breakdown */}
          <section className="mt-space-4 md:mt-space-5">
            <FinanceBreakdown />
          </section>

          {/* Payment methods on/off */}
          <section className="mt-space-4 md:mt-space-5">
            <section className="rounded-radius-md bg-card">
              <div className="flex flex-col gap-space-2 p-space-6">
                <h3 className="text-panel-title flex items-center gap-space-2">
                  <CreditCard className="h-5 w-5" />
                  Payment methods
                </h3>
                <p className="type-body text-muted-foreground">
                  Turn a method on or off. When off, it's hidden from every checkout on the platform.
                </p>
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
                      title="Couldn't load payment method settings"
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
                        <div className="flex items-center gap-1.5" title="Extra fee added on top of the price for this method">
                          <label className="text-xs text-muted-foreground">Fee</label>
                          <SurchargeInput
                            method={method}
                            initial={surcharge}
                            disabled={setSurchargeMutation.isPending}
                            onCommit={(percent) => {
                              if (percent !== surcharge) setSurchargeMutation.mutate({ method, percent });
                            }}
                          />
                        </div>
                        <Badge variant="secondary" className={enabled ? "bg-positive/15 text-positive dark:text-positive" : ""}>
                          {enabled ? "On" : "Off"}
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
          </section>

          {/* Test payments and the notification log moved to Diagnostics
              (/admin/diagnostics) — they check the plumbing, not the money. */}
        </>
      )}

      {financeTab === "profit" && <NetProfitPanel />}

      {financeTab === "payouts" && <ProviderPayoutsPanel />}

      <AlertDialog open={!!confirmDisable} onOpenChange={(o) => !o && setConfirmDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {confirmDisable}?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers won't be able to pay with {confirmDisable} once this is off.
              In-flight checkouts on this method will fail. You can turn it back
              on at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDisable) toggleMethodMutation.mutate({ method: confirmDisable, enabled: false });
                setConfirmDisable(null);
              }}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
};

export default AdminPayments;

/** Flat headline tile shared by the finance page. Mirrors the Dashboard's
 *  MetricTile shape so both admin surfaces feel the same. */
function FinanceTile({
  label, value, hint, accent, warning, className,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  warning?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-radius-md bg-card p-4 ${warning ? "bg-attention/10" : ""} ${className ?? ""}`}
    >
      <span className="text-meta text-muted-foreground">
        {label}
      </span>
      <p
        className={
          "text-2xl font-black tabular-nums tracking-tight md:text-3xl " +
          (accent ? "text-primary" : warning ? "text-attention" : "text-foreground")
        }
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Small local input for the per-method processing-fee surcharge (percent). */
function SurchargeInput({
  method,
  initial,
  disabled,
  onCommit,
}: {
  method: string;
  initial: number;
  disabled?: boolean;
  onCommit: (percent: number) => void;
}) {
  const [value, setValue] = useState<string>(String(initial ?? 0));
  useEffect(() => { setValue(String(initial ?? 0)); }, [initial, method]);
  const commit = () => {
    const n = Number(value);
    const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    setValue(String(clamped));
    onCommit(clamped);
  };
  return (
    <div className="relative">
      <input
        type="number"
        min="0"
        max="100"
        step="0.1"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
        disabled={disabled}
        className={cn(fieldClass, "w-[80px] pl-3 pr-6 text-right tabular-nums")}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  );
}
