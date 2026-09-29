import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.prosperasub.com";

/**
 * Multi-coin crypto payments through the backend's gateway
 * (`/payments/crypto/*`, NOWPayments today). Same life cycle as
 * `useInvoicePayment` — create → show address → poll → onPaid — so a checkout
 * wires it the same way:
 *
 *   const crypto = useCryptoGatewayPayment({ onPaid, onInvoiceReady });
 *   await crypto.start({ amountCents, payCurrency: "usdttrc20", meta });
 *
 * Polling also settles the order server-side (the status endpoint is
 * idempotent with the webhook and the cron), so a customer who closes the tab
 * after paying still gets their plan.
 */

export type CryptoPaymentState =
  | "waiting" | "confirming" | "paid" | "partial" | "expired" | "failed" | "refunded";

export interface CryptoPaymentView {
  payment_id: string;
  state: CryptoPaymentState;
  paid: boolean;
  pay_address: string | null;
  pay_extra_id: string | null;
  pay_amount: string | null;
  pay_currency: string | null;
  expires_at: string | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(json?.message) ? json.message.join(", ") : json?.message;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return json as T;
}

/** Is the gateway on, and which coins it takes. Cached; the list rarely changes. */
export function useCryptoGatewayConfig(enabled = true) {
  return useQuery({
    queryKey: ["crypto-gateway-config"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/payments/crypto/config`);
      if (!res.ok) throw new Error("Could not load crypto options.");
      return (await res.json()) as { enabled: boolean; provider: string | null; currencies: string[] };
    },
  });
}

interface Options {
  onPaid: (paymentId: string) => void;
  /** Fires once the payment exists, before the customer pays — persist the
   *  reference on the reserved row (see lib/payments/pendingReference). */
  onInvoiceReady?: (paymentId: string) => void;
  pollMs?: number;
  /** Gateways quote a fixed rate for a limited window; stop polling after it. */
  timeoutMs?: number;
}

export function useCryptoGatewayPayment({ onPaid, onInvoiceReady, pollMs = 6000, timeoutMs = 60 * 60_000 }: Options) {
  const [payment, setPayment] = useState<CryptoPaymentView | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paidRef = useRef(false);

  const cleanup = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
  };
  useEffect(() => cleanup, []);

  const poll = (paymentId: string) => {
    cleanup();
    pollRef.current = setInterval(async () => {
      try {
        const view = await post<CryptoPaymentView>("/payments/crypto/status", { payment_id: paymentId });
        setPayment((p) => (p ? { ...p, state: view.state, paid: view.paid } : view));
        if (view.paid && !paidRef.current) {
          paidRef.current = true;
          cleanup();
          onPaid(paymentId);
        } else if (["expired", "failed", "refunded"].includes(view.state)) {
          cleanup();
          setIsExpired(true);
        }
      } catch {
        // Transient — the next tick retries, and the webhook/cron are the backstop.
      }
    }, pollMs);
    timeoutRef.current = setTimeout(() => {
      if (paidRef.current) return;
      cleanup();
      setIsExpired(true);
    }, timeoutMs);
  };

  const start = async (args: { amountCents: number; payCurrency: string; meta?: Record<string, unknown> }) => {
    setIsGenerating(true);
    setIsExpired(false);
    setPayment(null);
    paidRef.current = false;
    try {
      const view = await post<CryptoPaymentView>("/payments/crypto/payment", {
        amount_cents: args.amountCents,
        pay_currency: args.payCurrency,
        ...(args.meta ?? {}),
      });
      setPayment(view);
      onInvoiceReady?.(view.payment_id);
      poll(view.payment_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the crypto payment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    cleanup();
    paidRef.current = false;
    setPayment(null);
    setIsExpired(false);
  };

  return { payment, isGenerating, isExpired, start, reset };
}
