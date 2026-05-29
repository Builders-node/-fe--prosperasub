import { useState } from "react";
import { Copy, CreditCard, Loader2, Mail, MessageCircle, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

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

const AdminPayments = () => {
  const queryClient = useQueryClient();
  const [testInvoice, setTestInvoice] = useState<TestInvoice | null>(null);

  const { data: paymentStats } = useQuery({
    queryKey: ["admin-payment-stats"],
    queryFn: async () => {
      const [pendingRes, paidRes, revenueRes] = await Promise.all([
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("payment_status", "pending"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("payment_status", "paid"),
        supabase.from("subscriptions").select("total_price_sats").eq("payment_status", "paid"),
      ]);

      const revenue = (revenueRes.data || []).reduce((sum, item) => sum + (item.total_price_sats || 0), 0);

      return {
        pending: pendingRes.count || 0,
        paid: paidRes.count || 0,
        revenue,
      };
    },
  });

  const { data: adminNotifications = [] } = useQuery({
    queryKey: ["admin-payment-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.admin.listPaymentNotifications();
      if (error) throw error;
      return (data || []) as AdminPaymentNotification[];
    },
  });

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
    <SuperAdminLayout title="Payments" subtitle="Monitor Lightning payments and test Blink invoices">
      <section className="grid grid-cols-2 gap-space-3 md:gap-space-4 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-label text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              Paid subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-section-title">{paymentStats?.paid ?? 0}</div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-label text-muted-foreground">
              <Loader2 className="h-4 w-4" />
              Pending payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-section-title">{paymentStats?.pending ?? 0}</div>
          </CardContent>
        </Card>

        <Card className="col-span-2 bg-primary/10 xl:col-span-4">
          <CardHeader className="pb-space-2">
            <CardTitle className="flex items-center gap-space-2 text-label text-muted-foreground">
              <Zap className="h-4 w-4 text-primary" />
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-section-title text-primary">{paymentStats?.revenue ?? 0} sats</div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-space-4 grid grid-cols-1 gap-space-4 md:mt-space-5 md:gap-space-5 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <Zap className="h-5 w-5 text-primary" />
              Blink Test Payment
            </CardTitle>
            <CardDescription>Generate a $1.00 Lightning QR code to test the active Blink wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-5">
            <Button
              className="w-full"
              onClick={() => testInvoiceMutation.mutate()}
              loading={testInvoiceMutation.isPending}
              loadingText="Generating..."
            >
              Generate $1 Test QR
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
              <div className="rounded-radius-lg border border-dashed border-[hsl(var(--app-divider))] p-space-8 text-center text-muted-foreground">
                Generate a test invoice to preview the QR code here.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Payment Operations
            </CardTitle>
            <CardDescription>Use this area for payment verification and Blink diagnostics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-3">
            <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
              <p className="font-bold">Pending review queue</p>
              <p className="mt-space-1 text-sm text-muted-foreground">Subscriptions waiting for payment confirmation should be reviewed from the Subscriptions tab.</p>
            </div>
            <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
              <p className="font-bold">Blink health check</p>
              <p className="mt-space-1 text-sm text-muted-foreground">Generate a test invoice after changing Blink keys or wallet settings.</p>
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/admin/subscriptions">Open Subscriptions</Link>
            </Button>
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
                {adminNotifications.map((notification) => (
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
                    {adminNotifications.map((notification) => (
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
            </>
          ) : (
            <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-8 text-center text-muted-foreground">
              Confirmed payment notifications will appear here after the first successful payment.
            </div>
          )}
        </CardContent>
      </Card>
    </SuperAdminLayout>
  );
};

export default AdminPayments;
