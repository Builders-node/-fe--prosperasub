import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Unified Blink invoice + polling hook. Handles both Lightning and on-chain
 * BTC payment flows so every checkout screen shares the exact same behaviour
 * (create → QR → poll → onPaid).
 *
 * Consumers:
 *   const inv = useInvoicePayment({ onPaid: (ref, method) => activate(ref, method) });
 *   await inv.start({ method: 'lightning', amountCents, amountSats, description, meta });
 *   // Renders inv.state.invoice / inv.state.address via <InvoiceQrPanel>.
 */
export interface InvoicePaymentState {
  invoice: string | null;        // lightning payment_request
  paymentHash: string | null;    // lightning payment_hash (verify handle)
  address: string | null;        // on-chain BTC address
  uri: string | null;            // bitcoin:… URI (on-chain QR value)
  sats: number | null;
  isPaid: boolean;
  isGenerating: boolean;
  /** Polling gave up — the invoice is stale and the QR must not be presented
   *  as if it were still live. */
  isExpired: boolean;
}

interface StartArgs {
  method: "lightning" | "onchain";
  amountCents: number;
  amountSats: number;
  description: string;
  context?: string;
  externalId?: string;
  meta?: Record<string, unknown>;
}

interface Options {
  onPaid: (paymentRef: string, method: "lightning" | "onchain") => void;
  /** Fires as soon as the invoice/address is created, before the user pays.
   *  Lets consumers persist payment_reference on the reservation row so the
   *  server-side reconcile cron can still confirm payment if the browser dies
   *  between invoice creation and confirmation. */
  onInvoiceReady?: (paymentRef: string, method: "lightning" | "onchain") => void;
  lightningPollMs?: number;
  onchainPollMs?: number;
  /**
   * How long to keep polling before declaring the invoice dead. Without this
   * the interval ran forever: an expired Lightning invoice sat on screen
   * showing "Waiting for payment…" indefinitely, with no way for the customer
   * to tell that scanning it could no longer work.
   *
   * Blink Lightning invoices expire well inside 15 minutes. On-chain gets
   * longer — a mempool confirmation legitimately takes a while.
   */
  lightningTimeoutMs?: number;
  onchainTimeoutMs?: number;
}

const INITIAL: InvoicePaymentState = {
  invoice: null,
  paymentHash: null,
  address: null,
  uri: null,
  sats: null,
  isPaid: false,
  isGenerating: false,
  isExpired: false,
};

export function useInvoicePayment({
  onPaid,
  onInvoiceReady,
  lightningPollMs = 3000,
  onchainPollMs = 5000,
  lightningTimeoutMs = 15 * 60_000,
  onchainTimeoutMs = 60 * 60_000,
}: Options) {
  const [state, setState] = useState<InvoicePaymentState>(INITIAL);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paidRef = useRef(false);

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const cleanup = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  /** Stop polling and mark the invoice stale — unless it was already paid. */
  const armTimeout = (ms: number) => {
    timeoutRef.current = setTimeout(() => {
      if (paidRef.current) return;
      cleanup();
      setState((s) => ({ ...s, isExpired: true }));
    }, ms);
  };

  const start = async ({ method, amountCents, amountSats, description, context, externalId, meta }: StartArgs) => {
    setState({ ...INITIAL, isGenerating: true, sats: amountSats });
    paidRef.current = false;

    try {
      if (method === "onchain") {
        const { data, error } = await supabase.functions.invoke("create-onchain-charge", {
          body: { amount_sats: amountSats, amount_cents: amountCents, description, ...(meta ?? {}) },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.address) throw new Error("Could not generate a Bitcoin address.");
        const uri = `bitcoin:${data.address}?amount=${(amountSats / 1e8).toFixed(8)}&label=EverySub&message=${encodeURIComponent(description)}`;
        setState((s) => ({ ...s, address: data.address, uri, isGenerating: false }));
        onInvoiceReady?.(data.address, "onchain");
        startOnchainPolling(data.address, amountSats);
        armTimeout(onchainTimeoutMs);
      } else {
        const { data, error } = await supabase.functions.invoke("create-invoice", {
          body: {
            amount_cents: amountCents,
            amount_sats: amountSats,
            context,
            description,
            external_id: externalId,
            ...(meta ?? {}),
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setState((s) => ({ ...s, invoice: data.payment_request, paymentHash: data.payment_hash, isGenerating: false }));
        onInvoiceReady?.(data.payment_hash, "lightning");
        startLightningPolling(data.payment_hash);
        armTimeout(lightningTimeoutMs);
      }
    } catch (e: any) {
      setState((s) => ({ ...s, isGenerating: false }));
      toast.error(e?.message || "Failed to generate invoice");
    }
  };

  const startLightningPolling = (hash: string) => {
    cleanup();
    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-payment", { body: { payment_hash: hash } });
        if (error) return;
        if (data?.paid && !paidRef.current) {
          paidRef.current = true;
          cleanup();
          setState((s) => ({ ...s, isPaid: true }));
          onPaid(hash, "lightning");
        }
      } catch (err) {
        console.error("Lightning verify error:", err);
      }
    }, lightningPollMs);
  };

  const startOnchainPolling = (address: string, satsAmount: number) => {
    cleanup();
    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-onchain-payment", {
          body: { address, amount_sats: satsAmount },
        });
        if (error) return;
        if (data?.paid && !paidRef.current) {
          paidRef.current = true;
          cleanup();
          setState((s) => ({ ...s, isPaid: true }));
          onPaid(address, "onchain");
        }
      } catch (err) {
        console.error("On-chain verify error:", err);
      }
    }, onchainPollMs);
  };

  const reset = () => {
    cleanup();
    paidRef.current = false;
    setState(INITIAL);
  };

  return { state, start, reset };
}
