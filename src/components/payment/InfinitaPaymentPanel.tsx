import { useState, useRef, useEffect } from "react";
import { AlertCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";
import { toast } from "sonner";

interface Props {
  totalCents: number;
  /** Called with the payment id once payment is CONFIRMED paid. */
  onPaid: (paymentId: string) => void;
  /** Called as soon as SimpleFi returns the payment_id, before the user pays.
   *  Lets consumers persist the reference on their pending row so the server
   *  reconcile cron can still confirm payment if the browser dies. */
  onInvoiceReady?: (paymentId: string) => void;
  /** Optional routing hint: which subscription table + row the webhook should
   *  update. Baked into the SimpleFi `reference` payload and echoed back by
   *  SimpleFi in the webhook so our backend can find the row directly.
   *  If omitted, the backend falls back to scanning by payment_reference. */
  service?: "cleaning" | "food" | "beach" | "rental" | "test";
  orderId?: string;
  orderMeta?: Record<string, unknown>;
  serviceName?: string;
}

/** LIVES payment via SimpleFi hosted checkout. */
export function InfinitaPaymentPanel({
  totalCents, onPaid, onInvoiceReady, service, orderId, orderMeta, serviceName,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const start = async () => {
    setCreating(true);
    setTerminalError(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-simplefi-invoice", {
        body: {
          amount_cents: totalCents,
          description: `${serviceName || "ProsperaSub"} — ${formatUSD(totalCents)}`,
          // service + order_id become reference.service + reference.orderId
          // in the SimpleFi payment_request, so the webhook can route directly.
          service,
          order_id: orderId,
          reference: {
            orderId: orderId || `order-${Date.now()}`,
            ...(service ? { service } : {}),
            ...(orderMeta || {}),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.checkout_url || !data?.payment_id) throw new Error("SimpleFi did not return a checkout link.");

      setCheckoutUrl(data.checkout_url);
      onInvoiceReady?.(data.payment_id);
      window.open(data.checkout_url, "_blank", "noopener,noreferrer");

      stopPolling();
      pollingRef.current = setInterval(async () => {
        const { data: v } = await supabase.functions.invoke("verify-simplefi-payment", {
          body: { payment_id: data.payment_id },
        });
        if (doneRef.current) return;
        if (v?.paid) {
          doneRef.current = true;
          stopPolling();
          setConfirmed(true);
          onPaid(data.payment_id);
          return;
        }
        // Terminal-but-not-paid: expired, canceled, failed, refunded. Bail
        // out of polling so the user sees an actionable error instead of an
        // infinite spinner.
        if (v?.terminal) {
          doneRef.current = true;
          stopPolling();
          setTerminalError(v.status || "Payment did not complete.");
        }
      }, 4000);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not start LIVES payment";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const retry = () => {
    doneRef.current = false;
    setCheckoutUrl(null);
    setTerminalError(null);
    void start();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-muted p-4 text-center">
        <p className="text-sm text-muted-foreground">Amount</p>
        <p className="text-2xl font-bold text-purple-500">{formatUSD(totalCents)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Pay with LIVES via SimpleFi</p>
      </div>

      {terminalError ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Payment {terminalError}</p>
              <p className="mt-0.5 text-xs opacity-80">Start a new payment to try again.</p>
            </div>
          </div>
          <Button className="w-full" onClick={retry}>Start new payment</Button>
        </div>
      ) : !checkoutUrl ? (
        <Button className="w-full gap-2" size="lg" onClick={start} disabled={creating || totalCents <= 0}>
          {creating ? <><Spinner size="sm" className="mr-1" /> Preparing…</> : <><ExternalLink className="h-4 w-4" /> Pay with LIVES</>}
        </Button>
      ) : confirmed ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-green-500/10 p-3 text-sm font-semibold text-green-500">
          <ShieldCheck className="h-4 w-4" /> Payment confirmed
        </div>
      ) : (
        <div className="space-y-3">
          <Button asChild className="w-full gap-2" size="lg" variant="outline">
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Re-open payment page
            </a>
          </Button>
          <div className="flex items-center justify-center gap-2 rounded-xl bg-purple-500/10 p-3 text-xs text-muted-foreground">
            <Spinner size="sm" />
            Waiting for payment confirmation… this updates automatically once paid.
          </div>
        </div>
      )}
    </div>
  );
}
