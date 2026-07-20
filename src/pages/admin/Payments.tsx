import { useState, useEffect } from "react";
import { Bitcoin, Copy, CreditCard, ExternalLink, Loader2, Mail, MessageCircle, RefreshCw, Wallet, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adminApi, supabase, supabaseDb } from "@/integrations/supabase/client";
import { FinanceBreakdown } from "@/components/admin/FinanceBreakdown";
import { NetProfitPanel } from "@/components/admin/NetProfitPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";

// Dashed placeholder shown before a test payment is generated.
function TestPaymentPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-radius-lg border border-dashed border-[hsl(var(--app-divider))] p-space-8 text-center text-muted-foreground">
      {children}
    </div>
  );
}

const PAYMENT_METHOD_META = [
  { method: "lightning", label: "Lightning", description: "Instant Bitcoin Lightning payments (Blink).", icon: Zap },
  { method: "onchain", label: "On-chain Bitcoin", description: "On-chain BTC via Blink.", icon: Bitcoin },
  { method: "infinita", label: "LIVES", description: "Pay with LIVES via SimpleFi checkout.", icon: Wallet },
  { method: "paypal", label: "PayPal", description: "Pay with PayPal or card.", icon: CreditCard },
] as const;

type TestInvoice = {
  payment_hash: string;
  payment_request: string;
  amount_sats?: number;
  status: string;
  paid?: boolean;
};

type AdminPaymentNotification = {
  id: string;
  serviceName: string;
  clientName?: string | null;
  clientEmail?: string | null;
  amountCents?: number | null;
  amountSats?: number | null;
  currency: string;
  planName?: string | null;
  duration?: string | null;
  provider: string;
  providerPaymentId: string;
  emailStatus: string;
  telegramStatus: string;
  paidAt: string;
  emailError?: string | null;
  telegramError?: string | null;
  adminUrl?: string | null;
};

const formatNotificationAmount = (notification: AdminPaymentNotification) => {
  if (typeof notification.amountCents === "number") return `$${(notification.amountCents / 100).toFixed(2)}`;
  if (typeof notification.amountSats === "number") return `${notification.amountSats.toLocaleString()} sats`;
  return "—";
};

const formatNotificationDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Tegucigalpa",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const notificationStatusClass = (status: string) => {
  if (status === "sent") return "bg-green-500/15 text-green-700 dark:text-green-300";
  if (status === "failed") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (status === "skipped") return "bg-muted text-muted-foreground";
  return "bg-primary/15 text-primary";
};

// On-chain test payment shape returned by `create-onchain-charge`.
type TestOnchainCharge = {
  address: string;
  amount_sats: number;
  amount_cents: number;
  paid?: boolean;
  status?: string;
  bip21?: string;   // some builds return a ready `bitcoin:...` URI
};

// SimpleFi/LIVES test payment shape.
type TestSimpleFi = {
  payment_id: string;
  checkout_url: string;
  amount_cents: number;
  paid?: boolean;
  status?: string;
};

const AdminPayments = () => {
  const queryClient = useQueryClient();
  const [testInvoice, setTestInvoice] = useState<TestInvoice | null>(null);
  const [testOnchain, setTestOnchain] = useState<TestOnchainCharge | null>(null);
  const [testSimpleFi, setTestSimpleFi] = useState<TestSimpleFi | null>(null);
  const [testPayPalPaid, setTestPayPalPaid] = useState<string | null>(null);

  // All-time finance totals across EVERY service (cleaning, food, beach, car).
  const { data: paymentStats = { pending: 0, paid: 0, revenueCents: 0 } } = useQuery({
    queryKey: ["admin-finance-totals-all"],
    queryFn: async () => {
      const [cleaning, beach, rental, food] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions").select("payment_status, subscription_status, total_price_cents, monthly_price_cents").is("deleted_at", null),
        supabaseDb.from("beach_club_subscriptions").select("payment_status, status, total_cents"),
        supabaseDb.from("rental_bookings").select("payment_status, status, total_cents").is("deleted_at", null),
        supabaseDb.from("food_subscriptions").select("status, payment_status, weekly_price_cents, commitment_weeks, periods_paid"),
      ]);
      let paid = 0, pending = 0, revenueCents = 0;
      (cleaning.data ?? []).forEach((r: any) => {
        if (r.payment_status === "paid") { paid++; revenueCents += r.total_price_cents || r.monthly_price_cents || 0; }
        else if (!["cancelled", "expired"].includes(r.subscription_status)) pending++;
      });
      (beach.data ?? []).forEach((r: any) => {
        if (r.payment_status === "paid") { paid++; revenueCents += r.total_cents || 0; }
        else if (r.status !== "cancelled") pending++;
      });
      (rental.data ?? []).forEach((r: any) => {
        if (r.payment_status === "paid") { paid++; revenueCents += r.total_cents || 0; }
        else if (r.status !== "cancelled") pending++;
      });
      // Food revenue counts ONLY paid subs — same discipline as the other three
      // tables. `status` (active/paused/expired) is a lifecycle marker, not a
      // payment marker; Infinita/crypto payments are not auto-reconciled and
      // must not appear in the revenue tile until they actually settle.
      (food.data ?? []).forEach((r: any) => {
        const s = String(r.status ?? "").toLowerCase();
        const isPaid = r.payment_status === "paid";
        if (isPaid && ["active", "paused", "expired"].includes(s)) {
          paid++;
          revenueCents += (r.weekly_price_cents || 0) * (r.commitment_weeks || 1) * (r.periods_paid || 1);
        } else if (!isPaid && s !== "cancelled") {
          pending++;
        }
      });
      return { paid, pending, revenueCents };
    },
  });

  const { data: methodSettings = [] } = useQuery({
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-method-settings"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update payment method"),
  });

  const setSurchargeMutation = useMutation({
    mutationFn: async ({ method, percent }: { method: string; percent: number }) => {
      // Preserve `enabled` (row may not exist yet — assume enabled by default).
      const existing = methodSettings.find((r) => r.method === method);
      const { error } = await supabaseDb
        .from("payment_method_settings")
        .upsert(
          { method, enabled: existing?.enabled ?? true, surcharge_percent: percent, updated_at: new Date().toISOString() },
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
    return row ? row.enabled : true;
  };
  const methodSurcharge = (method: string) => {
    const row = methodSettings.find((r) => r.method === method);
    return Number(row?.surcharge_percent ?? 0);
  };


  const { data: adminNotifications = [] } = useQuery({
    queryKey: ["admin-payment-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.admin.listPaymentNotifications();
      if (error) throw error;
      return (data || []) as AdminPaymentNotification[];
    },
  });

  const notifPager = usePagination(adminNotifications, 15);

  const testInvoiceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: {
          amount_cents: 100,
          context: "admin_test_payment",
          service_name: "Admin test payment",
          plan_name: "Blink health check",
          duration: "One time",
          admin_url: `${window.location.origin}/admin/payments`,
          description: "ProsperaSub admin test payment - $1.00",
          external_id: `admin-test-${Date.now()}`,
        },
      });

      if (error) throw error;
      return data as TestInvoice;
    },
    onSuccess: (invoice) => {
      setTestInvoice(invoice);
      toast.success("Test Lightning invoice generated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to generate test invoice"),
  });

  const testPaymentStatusMutation = useMutation({
    mutationFn: async () => {
      if (!testInvoice?.payment_hash) throw new Error("Generate a test invoice first.");

      const { data, error } = await supabase.functions.invoke("verify-payment", {
        body: {
          payment_hash: testInvoice.payment_hash,
          service_name: "Admin test payment",
          client_name: "ProsperaSub admin",
          plan_name: "Blink health check",
          duration: "One time",
          booking_id: "admin-test-payment",
          admin_url: `${window.location.origin}/admin/payments`,
          selected_date_time: new Date().toISOString(),
        },
      });

      if (error) throw error;
      return data as Partial<TestInvoice>;
    },
    onSuccess: (status) => {
      setTestInvoice((current) =>
        current
          ? {
              ...current,
              ...status,
              status: status.status || (status.paid ? "paid" : current.status),
              paid: status.paid ?? current.paid,
            }
          : current,
      );

      if (status.paid) {
        toast.success("Test payment confirmed. Admin notifications updated.");
        queryClient.invalidateQueries({ queryKey: ["admin-payment-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["admin-payment-stats"] });
      } else {
        toast.info("Test payment is still pending");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Failed to check test payment"),
  });

  // ─── On-chain test payment ────────────────────────────────────────────────
  // Same $1 as Lightning; `create-onchain-charge` returns address + amount_sats
  // and we poll `verify-onchain-payment` with those.
  const testOnchainMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-onchain-charge", {
        body: {
          amount_cents: 100,
          context: "admin_test_payment",
          service_name: "Admin on-chain test",
          plan_name: "Blink on-chain health check",
          description: "ProsperaSub admin on-chain test - $1.00",
          external_id: `admin-onchain-test-${Date.now()}`,
        },
      });
      if (error) throw error;
      return data as TestOnchainCharge;
    },
    onSuccess: (data) => {
      setTestOnchain(data);
      toast.success("Test on-chain address generated");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to generate on-chain address"),
  });

  const testOnchainStatusMutation = useMutation({
    mutationFn: async () => {
      if (!testOnchain?.address) throw new Error("Generate an on-chain address first.");
      const { data, error } = await supabase.functions.invoke("verify-onchain-payment", {
        body: { address: testOnchain.address, amount_sats: testOnchain.amount_sats },
      });
      if (error) throw error;
      return data as Partial<TestOnchainCharge>;
    },
    onSuccess: (status) => {
      setTestOnchain((cur) => cur ? { ...cur, ...status, paid: status.paid ?? cur.paid } : cur);
      if (status.paid) toast.success("On-chain payment confirmed");
      else toast.info("On-chain payment still pending — wait for confirmations");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to check on-chain payment"),
  });

  // ─── LIVES / SimpleFi test payment ────────────────────────────────────────
  const testSimpleFiMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-simplefi-invoice", {
        body: {
          amount_cents: 100,
          description: "ProsperaSub admin LIVES test - $1.00",
          reference: { orderId: `admin-lives-test-${Date.now()}`, context: "admin_test_payment" },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if (!data?.checkout_url || !data?.payment_id) throw new Error("SimpleFi did not return a checkout link.");
      return { ...data, amount_cents: 100 } as TestSimpleFi;
    },
    onSuccess: (data) => {
      setTestSimpleFi(data);
      window.open(data.checkout_url, "_blank", "noopener,noreferrer");
      toast.success("SimpleFi checkout opened in a new tab");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to start LIVES test"),
  });

  const testSimpleFiStatusMutation = useMutation({
    mutationFn: async () => {
      if (!testSimpleFi?.payment_id) throw new Error("Start a LIVES test payment first.");
      const { data, error } = await supabase.functions.invoke("verify-simplefi-payment", {
        body: { payment_id: testSimpleFi.payment_id },
      });
      if (error) throw error;
      return data as Partial<TestSimpleFi>;
    },
    onSuccess: (status) => {
      setTestSimpleFi((cur) => cur ? { ...cur, ...status, paid: status.paid ?? cur.paid } : cur);
      if (status.paid) toast.success("LIVES payment confirmed");
      else toast.info("LIVES payment still pending");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to check LIVES payment"),
  });

  const resendNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.admin.resendPaymentNotification(id);
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Admin notification resent");
      queryClient.invalidateQueries({ queryKey: ["admin-payment-notifications"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to resend notification"),
  });

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <SuperAdminLayout title="Finance" subtitle="Payments, revenue and net profit across all services">
      <Tabs defaultValue="payments" variant="pills" className="w-full">
        <TabsList className="mb-space-4">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="profit">Net Profit</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
      {/* Three headline tiles — same flat pattern as the Dashboard so a
          navigation switch between /admin/dashboard and /admin/payments doesn't
          feel like two different apps. Revenue keeps its primary accent only
          on the number itself; the tile background stays neutral. */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <FinanceTile label="Paid subscriptions" value={String(paymentStats?.paid ?? 0)} hint="All-time · all services" />
        <FinanceTile label="Awaiting payment"    value={String(paymentStats?.pending ?? 0)} hint="All-time · all services"
          warning={(paymentStats?.pending ?? 0) > 0} className="col-span-1" />
        <FinanceTile label="Revenue"             value={`$${((paymentStats?.revenueCents ?? 0) / 100).toFixed(2)}`}
          hint="All-time — breakdown below is per period" accent className="col-span-2 md:col-span-1" />
      </section>

      {/* Cross-category finance breakdown */}
      <section className="mt-space-4 md:mt-space-5">
        <FinanceBreakdown />
      </section>

      {/* Payment methods on/off */}
      <section className="mt-space-4 md:mt-space-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <CreditCard className="h-5 w-5" />
              Payment methods
            </CardTitle>
            <CardDescription>
              Turn a method on or off. When off, it's hidden from all checkouts (cleaning, food, cars).
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {PAYMENT_METHOD_META.map(({ method, label, description, icon: Icon }) => {
              const enabled = isMethodEnabled(method);
              const surcharge = methodSurcharge(method);
              return (
                <div key={method} className="flex flex-col gap-3 px-space-5 py-space-4 sm:flex-row sm:items-center sm:gap-space-4">
                  <div className="flex min-w-0 flex-1 items-center gap-space-4">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
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
                    <Badge variant="secondary" className={enabled ? "bg-green-500/15 text-green-600 dark:text-green-400" : ""}>
                      {enabled ? "On" : "Off"}
                    </Badge>
                    <Switch
                      checked={enabled}
                      disabled={toggleMethodMutation.isPending}
                      onCheckedChange={(v) => toggleMethodMutation.mutate({ method, enabled: v })}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      {/* ─── Test payments — one tab per active method ───────────────────────
          Each tab generates a $1 test invoice via its own edge function so
          admins can sanity-check every payment provider without touching a
          real subscription flow. */}
      <section className="mt-space-4 md:mt-space-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Test Payments
            </CardTitle>
            <CardDescription>
              Generate a $1.00 test payment against each provider — Lightning, on-chain BTC, LIVES or PayPal — to confirm the wallet + notifications pipeline is healthy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="lightning" variant="pills">
              <TabsList className="mb-space-4 flex flex-wrap gap-2">
                <TabsTrigger value="lightning"><Zap className="mr-1 h-3.5 w-3.5" /> Lightning</TabsTrigger>
                <TabsTrigger value="onchain"><Bitcoin className="mr-1 h-3.5 w-3.5" /> On-chain</TabsTrigger>
                <TabsTrigger value="lives"><Wallet className="mr-1 h-3.5 w-3.5" /> LIVES</TabsTrigger>
                <TabsTrigger value="paypal"><CreditCard className="mr-1 h-3.5 w-3.5" /> PayPal</TabsTrigger>
              </TabsList>

              {/* ── Lightning ──────────────────────────────────────────── */}
              <TabsContent value="lightning" className="space-y-space-5">
                <Button
                  className="w-full"
                  onClick={() => testInvoiceMutation.mutate()}
                  loading={testInvoiceMutation.isPending}
                  loadingText="Generating..."
                >
                  Generate $1 Lightning QR
                </Button>

                {testInvoice ? (
                  <div className="space-y-space-4">
                    <div className="rounded-radius-lg bg-white p-space-5">
                      <QRCodeSVG value={testInvoice.payment_request} size={240} level="M" className="mx-auto max-w-full" />
                    </div>

                    <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                      <p className="text-label text-muted-foreground">Amount</p>
                      <p className="text-section-title text-primary">
                        {testInvoice.amount_sats ? `${testInvoice.amount_sats.toLocaleString()} sats` : "$1.00"}
                      </p>
                      <p className="text-sm text-muted-foreground">Status: {testInvoice.status}</p>
                    </div>

                    <div className="space-y-space-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={() => testPaymentStatusMutation.mutate()}
                        loading={testPaymentStatusMutation.isPending}
                        loadingText="Checking..."
                        disabled={testInvoice.paid || testInvoice.status === "paid"}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Check payment and notify Telegram
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Pay the QR first, then check status. Telegram sends only after Blink confirms payment.
                      </p>
                    </div>

                    <div className="space-y-space-2">
                      <Label>Lightning invoice</Label>
                      <div className="flex gap-space-2">
                        <code className="max-h-24 flex-1 overflow-y-auto break-all rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3 text-xs">
                          {testInvoice.payment_request}
                        </code>
                        <Button type="button" variant="secondary" size="icon" onClick={() => copyValue(testInvoice.payment_request, "Invoice")} aria-label="Copy test invoice">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-space-2">
                      <Label>Payment hash</Label>
                      <div className="flex gap-space-2">
                        <code className="flex-1 break-all rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3 text-xs">{testInvoice.payment_hash}</code>
                        <Button type="button" variant="secondary" size="icon" onClick={() => copyValue(testInvoice.payment_hash, "Payment hash")} aria-label="Copy payment hash">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <TestPaymentPlaceholder>Generate a Lightning invoice to preview the QR here.</TestPaymentPlaceholder>
                )}
              </TabsContent>

              {/* ── On-chain BTC ───────────────────────────────────────── */}
              <TabsContent value="onchain" className="space-y-space-5">
                <Button
                  className="w-full"
                  onClick={() => testOnchainMutation.mutate()}
                  loading={testOnchainMutation.isPending}
                  loadingText="Generating..."
                >
                  Generate $1 On-chain address
                </Button>

                {testOnchain ? (
                  <div className="space-y-space-4">
                    <div className="rounded-radius-lg bg-white p-space-5">
                      <QRCodeSVG
                        value={testOnchain.bip21 || `bitcoin:${testOnchain.address}?amount=${(testOnchain.amount_sats / 1e8).toFixed(8)}`}
                        size={240}
                        level="M"
                        className="mx-auto max-w-full"
                      />
                    </div>

                    <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                      <p className="text-label text-muted-foreground">Amount</p>
                      <p className="text-section-title text-primary">
                        {testOnchain.amount_sats.toLocaleString()} sats
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ${(testOnchain.amount_cents / 100).toFixed(2)} · Status: {testOnchain.paid ? "paid" : (testOnchain.status || "pending")}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => testOnchainStatusMutation.mutate()}
                      loading={testOnchainStatusMutation.isPending}
                      loadingText="Checking..."
                      disabled={testOnchain.paid}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Check on-chain confirmation
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Send BTC to the address, then check. Requires at least 1 confirmation.
                    </p>

                    <div className="space-y-space-2">
                      <Label>Bitcoin address</Label>
                      <div className="flex gap-space-2">
                        <code className="flex-1 break-all rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3 text-xs">{testOnchain.address}</code>
                        <Button type="button" variant="secondary" size="icon" onClick={() => copyValue(testOnchain.address, "Address")} aria-label="Copy address">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <TestPaymentPlaceholder>Generate an on-chain address to preview the QR here.</TestPaymentPlaceholder>
                )}
              </TabsContent>

              {/* ── LIVES / SimpleFi ───────────────────────────────────── */}
              <TabsContent value="lives" className="space-y-space-5">
                <Button
                  className="w-full"
                  onClick={() => testSimpleFiMutation.mutate()}
                  loading={testSimpleFiMutation.isPending}
                  loadingText="Starting..."
                >
                  Start $1 LIVES test payment
                </Button>

                {testSimpleFi ? (
                  <div className="space-y-space-4">
                    <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                      <p className="text-label text-muted-foreground">Amount</p>
                      <p className="text-section-title text-primary">
                        ${(testSimpleFi.amount_cents / 100).toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Status: {testSimpleFi.paid ? "paid" : (testSimpleFi.status || "pending")}
                      </p>
                    </div>

                    <div className="flex gap-space-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => window.open(testSimpleFi.checkout_url, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Reopen SimpleFi checkout
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => testSimpleFiStatusMutation.mutate()}
                        loading={testSimpleFiStatusMutation.isPending}
                        loadingText="Checking..."
                        disabled={testSimpleFi.paid}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Check payment
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Complete the payment on SimpleFi, then check. The reconcile cron does NOT auto-confirm LIVES payments — this is the only way to test the end-to-end flow.
                    </p>

                    <div className="space-y-space-2">
                      <Label>Payment ID</Label>
                      <div className="flex gap-space-2">
                        <code className="flex-1 break-all rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3 text-xs">{testSimpleFi.payment_id}</code>
                        <Button type="button" variant="secondary" size="icon" onClick={() => copyValue(testSimpleFi.payment_id, "Payment ID")} aria-label="Copy payment id">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <TestPaymentPlaceholder>Start a LIVES test to open the SimpleFi checkout in a new tab.</TestPaymentPlaceholder>
                )}
              </TabsContent>

              {/* ── PayPal ─────────────────────────────────────────────── */}
              <TabsContent value="paypal" className="space-y-space-5">
                <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                  <p className="text-label text-muted-foreground">Amount</p>
                  <p className="text-section-title text-primary">$1.00</p>
                  <p className="text-sm text-muted-foreground">
                    Uses the same PayPal panel as real checkouts. In {import.meta.env.PROD ? "production" : "sandbox"} mode.
                  </p>
                </div>

                {testPayPalPaid ? (
                  <div className="rounded-radius-lg border border-green-500/40 bg-green-500/10 p-space-4 text-sm">
                    <p className="font-semibold text-green-600 dark:text-green-400">Test payment captured ✓</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">Capture id: {testPayPalPaid}</p>
                    <Button
                      className="mt-space-3"
                      variant="secondary"
                      size="sm"
                      onClick={() => setTestPayPalPaid(null)}
                    >
                      Run another test
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-radius-lg border border-[hsl(var(--app-divider))] p-space-4">
                    <PayPalPanel
                      totalCents={100}
                      onPaid={(captureId) => {
                        setTestPayPalPaid(captureId);
                        toast.success("PayPal test payment captured");
                      }}
                      orderMeta={{
                        description: "ProsperaSub admin PayPal test - $1.00",
                        service_name: "Admin PayPal test",
                        context: "admin_test_payment",
                      }}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>

      <Card className="mt-space-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-space-2">
            <Mail className="h-5 w-5 text-primary" />
            Admin Notification Log
          </CardTitle>
          <CardDescription>Email and Telegram delivery history for confirmed payments.</CardDescription>
        </CardHeader>
        <CardContent>
          {adminNotifications.length > 0 ? (
            <>
              {/* Mobile card view */}
              <div className="space-y-space-3 md:hidden">
                {notifPager.paged.map((notification) => (
                  <div key={notification.id} className="rounded-radius-lg border border-border bg-card p-space-4 space-y-space-2">
                    <div className="flex items-start justify-between gap-space-3">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{notification.serviceName}</p>
                        <p className="text-sm text-muted-foreground truncate">{notification.clientName || notification.clientEmail || "Client not provided"}</p>
                      </div>
                      <span className="shrink-0 font-bold text-primary">{formatNotificationAmount(notification)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-space-2">
                      <Badge className={notificationStatusClass(notification.emailStatus)}>{notification.emailStatus}</Badge>
                      <Badge className={notificationStatusClass(notification.telegramStatus)}>
                        <MessageCircle className="mr-space-1 h-3 w-3" />
                        {notification.telegramStatus}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatNotificationDate(notification.paidAt)}</span>
                    </div>
                    <div className="flex gap-space-2 pt-space-1">
                      {notification.adminUrl ? (
                        <Button asChild variant="tertiary" size="sm" className="flex-1">
                          <a href={notification.adminUrl}>Open record</a>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => resendNotificationMutation.mutate(notification.id)}
                        disabled={resendNotificationMutation.isPending}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Resend
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telegram</TableHead>
                      <TableHead>Paid at</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifPager.paged.map((notification) => (
                      <TableRow key={notification.id}>
                        <TableCell>
                          <div className="font-bold">{notification.serviceName}</div>
                          <div className="text-sm text-muted-foreground">
                            {notification.clientName || notification.clientEmail || "Client not provided"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {notification.planName || "No plan"}{notification.duration ? ` · ${notification.duration}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold">{formatNotificationAmount(notification)}</TableCell>
                        <TableCell>
                          <Badge className={notificationStatusClass(notification.emailStatus)}>{notification.emailStatus}</Badge>
                          {notification.emailError ? <p className="mt-space-1 max-w-48 text-xs text-destructive">{notification.emailError}</p> : null}
                        </TableCell>
                        <TableCell>
                          <Badge className={notificationStatusClass(notification.telegramStatus)}>
                            <MessageCircle className="mr-space-1 h-3 w-3" />
                            {notification.telegramStatus}
                          </Badge>
                          {notification.telegramError ? <p className="mt-space-1 max-w-48 text-xs text-destructive">{notification.telegramError}</p> : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatNotificationDate(notification.paidAt)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-space-2">
                            {notification.adminUrl ? (
                              <Button asChild variant="tertiary" size="sm">
                                <a href={notification.adminUrl}>Open record</a>
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => resendNotificationMutation.mutate(notification.id)}
                              disabled={resendNotificationMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4" />
                              Resend
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination {...notifPager} onPage={notifPager.setPage} />
            </>
          ) : (
            <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-8 text-center text-muted-foreground">
              Confirmed payment notifications will appear here after the first successful payment.
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="profit">
          <NetProfitPanel />
        </TabsContent>
      </Tabs>
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
      className={`flex flex-col gap-2 rounded-2xl bg-card p-4 ${warning ? "bg-amber-500/10" : ""} ${className ?? ""}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p
        className={
          "text-2xl font-black tabular-nums tracking-tight md:text-3xl " +
          (accent ? "text-primary" : warning ? "text-amber-500" : "text-foreground")
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
        className="h-8 w-[80px] rounded-md border border-input bg-background pl-2 pr-6 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary/30"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  );
}
