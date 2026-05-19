import { useState } from "react";
import { Copy, CreditCard, Loader2, ShieldCheck, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type TestInvoice = {
  payment_hash: string;
  payment_request: string;
  amount_sats?: number;
  status: string;
};

const AdminPayments = () => {
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

  const testInvoiceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-invoice", {
        body: {
          amount_cents: 100,
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

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <SuperAdminLayout title="Payments" subtitle="Monitor Lightning payments and test Blink invoices">
      <section className="grid grid-cols-1 gap-space-4 sm:grid-cols-2 xl:grid-cols-12">
        <Card className="min-h-36 xl:col-span-4">
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

        <Card className="min-h-36 xl:col-span-4">
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

        <Card className="min-h-36 bg-primary/10 sm:col-span-2 xl:col-span-4">
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

      <section className="mt-space-5 grid grid-cols-1 gap-space-5 xl:grid-cols-12">
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
    </SuperAdminLayout>
  );
};

export default AdminPayments;
