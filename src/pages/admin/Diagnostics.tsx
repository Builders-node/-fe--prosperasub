import { useState } from "react";
import { Bitcoin, Copy, CreditCard, Mail, MessageCircle, RefreshCw, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { TabPills } from "@/components/admin/TabPills";
import { DomainEventBusPanel } from "@/components/admin/DomainEventBusPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination, TablePagination } from "@/components/ui/table-pagination";
import { supabase } from "@/integrations/supabase/client";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { formatUSD } from "@/lib/pricing";
import { useTabParam } from "@/hooks/useTabParam";
import { QueryError } from "@/components/patterns/QueryError";

/**
 * The developer's corner of the admin.
 *
 * These three tools used to sit on Finance and Analytics — a $1 test invoice
 * per rail, the log of admin payment notifications, and the domain event bus.
 * They answer "is the plumbing working", which is a different question from
 * "how is the business doing", and they took more of those screens than the
 * money did. They live here now, one link away, for whoever is checking a
 * payment rail after a deploy or draining a stuck outbox.
 */

// Dashed placeholder shown before a test payment is generated.
function TestPaymentPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-radius-lg border border-dashed border-[hsl(var(--app-divider))] p-space-8 text-center text-muted-foreground">
      {children}
    </div>
  );
}

type TestInvoice = {
  payment_hash: string;
  payment_request: string;
  amount_sats?: number;
  status: string;
  paid?: boolean;
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
  if (typeof notification.amountCents === "number") return formatUSD(notification.amountCents);
  if (typeof notification.amountSats === "number") return `${notification.amountSats.toLocaleString()} sats`;
  return "—";
};

const formatNotificationDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Tegucigalpa",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

// The pill vocabulary's own tones (see StatusPill) — so "sent" here and "paid"
// on Finance are the same green for the same good news.
const notificationStatusClass = (status: string) => {
  if (status === "sent") return "bg-positive/15 text-positive";
  if (status === "failed") return "bg-destructive/15 text-destructive";
  if (status === "skipped") return "bg-muted text-muted-foreground";
  return "bg-primary/15 text-primary";
};

const RAILS = ["lightning", "onchain", "paypal"] as const;
type Rail = (typeof RAILS)[number];

const Diagnostics = () => {
  return (
    <SuperAdminLayout
      title="Diagnostics"
      subtitle="Check the payment rails and the event bus — $1 test payments, the admin notification log and the domain event outbox"
    >
      <div className="space-y-space-4 md:space-y-space-5">
        <TestPayments />
        <NotificationLog />
        <DomainEventBusPanel />
      </div>
    </SuperAdminLayout>
  );
};

export default Diagnostics;

/**
 * One $1 test per live rail, each through its own edge function, so a rail
 * can be sanity-checked without touching a real subscription flow.
 */
function TestPayments() {
  const queryClient = useQueryClient();
  const [rail, setRail] = useTabParam(RAILS, { key: "rail" });
  const [testInvoice, setTestInvoice] = useState<TestInvoice | null>(null);
  const [testOnchain, setTestOnchain] = useState<TestOnchainCharge | null>(null);
  const [testPayPalPaid, setTestPayPalPaid] = useState<string | null>(null);

  const adminUrl = `${window.location.origin}/admin/diagnostics`;

  const testInvoiceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: {
          amount_cents: 100,
          context: "admin_test_payment",
          service_name: "Admin test payment",
          plan_name: "Blink health check",
          duration: "One time",
          admin_url: adminUrl,
          description: "EverySub admin test payment - $1.00",
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
          client_name: "EverySub admin",
          plan_name: "Blink health check",
          duration: "One time",
          booking_id: "admin-test-payment",
          admin_url: adminUrl,
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
      } else {
        toast.info("Test payment is still pending");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Failed to check test payment"),
  });

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
          description: "EverySub admin on-chain test - $1.00",
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

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <section className="rounded-radius-md bg-card">
      <div className="flex flex-col gap-space-2 p-space-6">
        <h3 className="text-panel-title flex items-center gap-space-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Test payments
        </h3>
        <p className="type-body text-muted-foreground">
          Generate a $1.00 test payment on each rail — Lightning, on-chain BTC or PayPal — to confirm
          the wallet and the notification pipeline are healthy. Test payments are not sales and never
          reach revenue.
        </p>
      </div>
      <div className="space-y-space-5 p-space-6 pt-0">
        <TabPills
          value={rail}
          onChange={setRail}
          tabs={[
            { value: "lightning", label: "Lightning" },
            { value: "onchain", label: "On-chain" },
            { value: "paypal", label: "PayPal" },
          ] satisfies Array<{ value: Rail; label: string }>}
        />

        {rail === "lightning" && (
          <div className="space-y-space-5">
            <Button
              className="w-full"
              onClick={() => testInvoiceMutation.mutate()}
              loading={testInvoiceMutation.isPending}
              loadingText="Generating..."
            >
              <Zap className="h-4 w-4" />
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
          </div>
        )}

        {rail === "onchain" && (
          <div className="space-y-space-5">
            <Button
              className="w-full"
              onClick={() => testOnchainMutation.mutate()}
              loading={testOnchainMutation.isPending}
              loadingText="Generating..."
            >
              <Bitcoin className="h-4 w-4" />
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
                    {formatUSD(testOnchain.amount_cents)} · Status: {testOnchain.paid ? "paid" : (testOnchain.status || "pending")}
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
          </div>
        )}

        {rail === "paypal" && (
          <div className="space-y-space-5">
            <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
              <p className="text-label text-muted-foreground">Amount</p>
              <p className="text-section-title text-primary">$1.00</p>
              <p className="text-sm text-muted-foreground">
                Uses the same PayPal panel as real checkouts. In {import.meta.env.PROD ? "production" : "sandbox"} mode.
              </p>
            </div>

            {testPayPalPaid ? (
              <div className="rounded-radius-lg border border-positive/40 bg-positive/10 p-space-4 text-sm">
                <p className="font-semibold text-positive dark:text-positive">Test payment captured ✓</p>
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
                    description: "EverySub admin PayPal test - $1.00",
                    service_name: "Admin PayPal test",
                    context: "admin_test_payment",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Email + Telegram delivery history for confirmed payments, with a resend. */
function NotificationLog() {
  const queryClient = useQueryClient();

  const { data: adminNotifications = [], isError, error, refetch } = useQuery({
    queryKey: ["admin-payment-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.admin.listPaymentNotifications();
      if (error) throw error;
      return (data || []) as AdminPaymentNotification[];
    },
  });

  const notifPager = usePagination(adminNotifications, 15);

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

  return (
    <section className="rounded-radius-md bg-card">
      <div className="flex flex-col gap-space-2 p-space-6">
        <h3 className="text-panel-title flex items-center gap-space-2">
          <Mail className="h-5 w-5 text-primary" />
          Admin notification log
        </h3>
        <p className="type-body text-muted-foreground">Email and Telegram delivery history for confirmed payments.</p>
      </div>
      <div className="p-space-6 pt-0">
        {isError ? (
          <QueryError
            compact
            title="Couldn't load the notification log"
            error={error as Error}
            onRetry={() => void refetch()}
          />
        ) : adminNotifications.length > 0 ? (
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
                      <Button asChild variant="ghost" size="sm" className="flex-1">
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
                            <Button asChild variant="ghost" size="sm">
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
      </div>
    </section>
  );
}
