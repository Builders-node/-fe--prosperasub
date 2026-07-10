import { useState, useRef, useEffect } from "react";
import { Copy, Zap, Bitcoin } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PaymentMethodSelector, type PaymentMethod } from "@/components/payment/PaymentMethodSelector";
import { InfinitaPaymentPanel } from "@/components/payment/InfinitaPaymentPanel";
import { PayPalPanel } from "@/components/payment/PayPalPanel";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useBtcPrice } from "@/hooks/useBtcPrice";
import { formatUSD, centsToDollars } from "@/lib/pricing";
import { toast } from "sonner";

interface PaidArgs { method: string; paymentRef: string; pending: boolean }

interface Props {
  amountCents: number;
  serviceName: string;
  context: string;
  externalIdPrefix: string;
  adminUrl: string;
  clientName?: string;
  clientPhone?: string;
  /** Persist the record once payment is confirmed (throw to fail). */
  onPaid: (args: PaidArgs) => Promise<void>;
  /** Blocks the pay button (e.g. form invalid). */
  disabled?: boolean;
  payLabelPrefix?: string;    // "Pay" / "Subscribe"
}

/** Generic fixed-amount payment engine: method selector + Lightning/On-chain/Infinita/PayPal flow. */
export function PayBox({
  amountCents, serviceName, context, externalIdPrefix, adminUrl,
  clientName, clientPhone, onPaid, disabled, payLabelPrefix = "Pay",
}: Props) {
  const { enabled: enabledMethods, addSurchargeCents, surchargePercent } = usePaymentMethods();
  const { btcPrice, convertToSats, isLoading: priceLoading } = useBtcPrice();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("lightning");
  const [payOpen, setPayOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [onchainAddress, setOnchainAddress] = useState<string | null>(null);
  const [onchainUri, setOnchainUri] = useState<string | null>(null);
  const [lockedSats, setLockedSats] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const createdRef = useRef(false);
  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.includes(paymentMethod)) setPaymentMethod(enabledMethods[0]);
  }, [enabledMethods, paymentMethod]);

  const finish = async (paymentRef: string, pending = false) => {
    if (createdRef.current) return;
    createdRef.current = true;
    try {
      await onPaid({ method: paymentMethod === "infinita" ? "crypto" : paymentMethod, paymentRef, pending });
    } catch (e: any) {
      createdRef.current = false;
      toast.error(e?.message || "Could not complete");
      return;
    }
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const effectiveCents = addSurchargeCents(amountCents, paymentMethod);
  const feePct = surchargePercent(paymentMethod);

  const start = async () => {
    if (amountCents <= 0 || disabled) return;
    createdRef.current = false;
    const desc = `${serviceName} — ${formatUSD(effectiveCents)}`;
    if (paymentMethod === "infinita" || paymentMethod === "paypal") { setPayOpen(true); return; }
    if (!btcPrice) { toast.error("BTC price not loaded yet."); return; }
    const sats = convertToSats(centsToDollars(effectiveCents));
    if (sats <= 0) { toast.error("Amount too small."); return; }
    setGenerating(true); setLockedSats(sats);
    try {
      if (paymentMethod === "onchain") {
        const { data, error } = await supabase.functions.invoke("create-onchain-charge", {
          body: { amount_sats: sats, amount_cents: effectiveCents, description: desc, service_name: serviceName, client_name: clientName ?? "", client_phone: clientPhone ?? "", admin_url: adminUrl },
        });
        if (error) throw error; if (data?.error) throw new Error(data.error);
        setOnchainAddress(data.address);
        setOnchainUri(`bitcoin:${data.address}?amount=${(sats / 1e8).toFixed(8)}&label=ProsperaSub`);
        setPayOpen(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          const { data: v } = await supabase.functions.invoke("verify-onchain-payment", { body: { address: data.address, amount_sats: sats } });
          if (v?.paid) finish(data.address);
        }, 5000);
      } else {
        const { data, error } = await supabase.functions.invoke("create-invoice", {
          body: { amount_cents: effectiveCents, amount_sats: sats, context, description: desc, service_name: serviceName, client_name: clientName ?? "", client_phone: clientPhone ?? "", admin_url: adminUrl, external_id: `${externalIdPrefix}-${Date.now()}`.slice(0, 100) },
        });
        if (error) throw error; if (data.error) throw new Error(data.error);
        setInvoice(data.payment_request); setPayOpen(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          const { data: v } = await supabase.functions.invoke("verify-payment", { body: { payment_hash: data.payment_hash } });
          if (v?.paid) finish(data.payment_hash);
        }, 3000);
      }
    } catch (e: any) { toast.error(e?.message || "Could not start payment"); setLockedSats(null); }
    finally { setGenerating(false); }
  };

  const cancel = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setInvoice(null); setOnchainAddress(null); setOnchainUri(null); setLockedSats(null); setPayOpen(false);
  };
  const estSats = btcPrice ? convertToSats(centsToDollars(effectiveCents)) : 0;

  return (
    <div className="space-y-3">
      {!payOpen && (
        <>
          <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} available={enabledMethods} />
          {feePct > 0 && (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Processing fee: <strong className="text-foreground">+{feePct}%</strong> · Total to pay:{" "}
              <strong className="text-foreground">{formatUSD(effectiveCents)}</strong>
            </p>
          )}
          <Button className="h-12 w-full rounded-2xl text-base font-bold" onClick={start}
            disabled={disabled || generating || ((paymentMethod === "lightning" || paymentMethod === "onchain") && (priceLoading || !btcPrice))}>
            {generating ? <><Spinner size="sm" className="mr-2" /> Starting…</>
              : paymentMethod === "infinita" ? <>{payLabelPrefix} {formatUSD(effectiveCents)} with LIVES</>
              : paymentMethod === "paypal" ? <>Continue with PayPal</>
              : paymentMethod === "onchain" ? <><Bitcoin className="mr-2 h-5 w-5" /> {payLabelPrefix} {estSats.toLocaleString()} sats</>
              : <><Zap className="mr-2 h-5 w-5" /> {payLabelPrefix} {estSats.toLocaleString()} sats</>}
          </Button>
        </>
      )}

      {payOpen && paymentMethod === "infinita" && (
        <InfinitaPaymentPanel
          totalCents={effectiveCents}
          serviceName={serviceName}
          orderMeta={{ context, service_name: serviceName, client_name: clientName ?? "", client_phone: clientPhone ?? "" }}
          onPaid={(pid) => finish(pid, false)}
        />
      )}
      {payOpen && paymentMethod === "paypal" && <PayPalPanel totalCents={effectiveCents} onPaid={(cap) => finish(cap)} />}
      {payOpen && paymentMethod === "lightning" && invoice && (
        <div className="flex flex-col items-center rounded-2xl border border-border p-4 text-center">
          <p className="mb-2 font-bold">Scan to pay {formatUSD(effectiveCents)}</p>
          <div className="rounded-xl bg-white p-3"><QRCodeSVG value={invoice} size={200} level="M" /></div>
          <p className="mt-2 text-xs text-muted-foreground">{(lockedSats ?? estSats).toLocaleString()} sats · waiting…</p>
          <Button variant="ghost" size="sm" className="mt-1 gap-1.5" onClick={() => { navigator.clipboard.writeText(invoice); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /> Copy</Button>
        </div>
      )}
      {payOpen && paymentMethod === "onchain" && onchainAddress && (
        <div className="flex flex-col items-center rounded-2xl border border-border p-4 text-center">
          <p className="mb-2 font-bold">Send Bitcoin — {formatUSD(effectiveCents)}</p>
          <div className="rounded-xl bg-white p-3"><QRCodeSVG value={onchainUri ?? `bitcoin:${onchainAddress}`} size={200} level="M" /></div>
          <p className="mt-2 text-xs text-muted-foreground">{(lockedSats ?? estSats).toLocaleString()} sats · waiting…</p>
        </div>
      )}
      {payOpen && <Button variant="ghost" className="w-full" onClick={cancel}>Cancel payment</Button>}
    </div>
  );
}
