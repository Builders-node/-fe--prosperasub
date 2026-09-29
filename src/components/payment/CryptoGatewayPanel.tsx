import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Coins, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/pricing";
import { cryptoCurrencyLabel, sortCryptoCurrencies } from "@/lib/payments/cryptoCurrencies";
import { useCryptoGatewayConfig, useCryptoGatewayPayment } from "@/hooks/useCryptoGatewayPayment";

interface Props {
  /** What the customer is charged, surcharge included (USD cents). */
  totalCents: number;
  /** Checkout-session details (service, plan, client…) — same meta the Bitcoin rails send. */
  meta?: Record<string, unknown>;
  onPaid: (paymentId: string) => void;
  onInvoiceReady?: (paymentId: string) => void;
  isPaid?: boolean;
  successLabel?: string;
}

/**
 * Pay in any coin the gateway takes. Two steps on one card: pick a coin, then
 * an address + exact amount + QR in that coin — laid out like InvoiceQrPanel
 * so every crypto rail reads the same.
 *
 * The network is shown next to every coin and repeated above the address:
 * sending USDT on the wrong chain is the one mistake here that loses money.
 */
export function CryptoGatewayPanel({ totalCents, meta, onPaid, onInvoiceReady, isPaid = false, successLabel = "Activating…" }: Props) {
  const config = useCryptoGatewayConfig();
  const [coin, setCoin] = useState<string | null>(null);
  const pay = useCryptoGatewayPayment({ onPaid, onInvoiceReady });
  const p = pay.payment;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  if (config.isLoading) {
    return <section className="flex justify-center rounded-radius-lg bg-card p-8"><Spinner size="md" /></section>;
  }
  if (config.isError || !config.data?.enabled || config.data.currencies.length === 0) {
    return (
      <section className="flex items-center gap-2 rounded-radius-lg bg-card p-5 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Crypto payments are unavailable right now. Please choose another method.
      </section>
    );
  }

  // ── Step 1: choose a coin ────────────────────────────────────────────
  if (!p) {
    const codes = sortCryptoCurrencies(config.data.currencies);
    return (
      <section className="space-y-4 rounded-radius-lg bg-card p-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.02em] text-foreground">
          <Coins className="h-5 w-5 text-[#26a17b]" /> Pay with crypto
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {codes.map((code) => {
            const { coin: name, network } = cryptoCurrencyLabel(code);
            const active = coin === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setCoin(code)}
                aria-pressed={active}
                className={cn(
                  "rounded-radius-md px-3 py-2.5 text-left transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-inset text-foreground hover:bg-muted",
                )}
              >
                <span className="block text-[15px] font-semibold leading-tight">{name}</span>
                <span className={cn("block text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {network ?? " "}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          className="w-full"
          disabled={!coin || pay.isGenerating}
          onClick={() => coin && pay.start({ amountCents: totalCents, payCurrency: coin, meta })}
        >
          {pay.isGenerating ? <Spinner size="sm" /> : `Pay ${formatUSD(totalCents)}`}
        </Button>
      </section>
    );
  }

  // ── Step 2: address + amount ─────────────────────────────────────────
  const { coin: name, network } = cryptoCurrencyLabel(p.pay_currency ?? "");
  const address = p.pay_address ?? "";
  const expired = pay.isExpired && !isPaid;
  const partial = p.state === "partial" && !isPaid;

  return (
    <section className="space-y-4 rounded-radius-lg bg-card p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.02em] text-foreground">
        <Coins className="h-5 w-5 text-[#26a17b]" /> Pay with {name}{network ? ` on ${network}` : ""}
      </h2>

      {address && (
        <div className={cn("flex justify-center rounded-radius-md bg-white p-4", expired && "opacity-40")}>
          <QRCodeSVG value={address} size={200} level="M" />
        </div>
      )}

      <div className="rounded-radius-md bg-inset p-4 text-center">
        <p className="text-sm text-muted-foreground">Send exactly</p>
        <div className="flex items-center justify-center gap-2">
          <p className="break-all text-2xl font-semibold text-foreground">{p.pay_amount} {name}</p>
          {p.pay_amount && (
            <Button variant="tertiary" size="iconSm" onClick={() => copy(p.pay_amount!)} aria-label="Copy amount">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{formatUSD(totalCents)} total</p>
      </div>

      {network && (
        <p className="rounded-radius-sm bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          Send on the <strong>{network}</strong> network only. Other networks cannot be recovered.
        </p>
      )}

      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Address</Label>
        <div className="flex items-center gap-2">
          <code className="max-h-20 flex-1 overflow-y-auto break-all rounded-radius-md bg-inset p-3 text-xs">{address}</code>
          <Button variant="secondary" size="icon" onClick={() => copy(address)} aria-label="Copy address">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {p.pay_extra_id && (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Memo / tag (required)</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-radius-md bg-inset p-3 text-xs">{p.pay_extra_id}</code>
            <Button variant="secondary" size="icon" onClick={() => copy(p.pay_extra_id!)} aria-label="Copy memo">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-radius-md p-4 sm:flex-row",
          isPaid ? "bg-green-500/10" : expired ? "bg-muted" : partial ? "bg-amber-500/10" : "bg-[#26a17b]/10",
        )}
      >
        {isPaid ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-500">Payment confirmed! {successLabel}</span>
          </>
        ) : expired ? (
          <>
            <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">This payment expired. Nothing was charged.</span>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={pay.reset}>Start again</Button>
          </>
        ) : partial ? (
          <>
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
            <span className="text-sm font-medium">Less than the full amount arrived. Send the rest to the same address, or contact support.</span>
          </>
        ) : (
          <>
            <Spinner size="md" className="text-[#26a17b]" />
            <span className="text-sm font-medium">
              {p.state === "confirming" ? "Payment seen — waiting for network confirmations…" : "Waiting for payment…"}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
