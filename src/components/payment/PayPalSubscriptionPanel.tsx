import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { accountApi } from "@/integrations/supabase/client";
import { apiUrlFor } from "@/integrations/supabase/config";

/**
 * PayPal with automatic renewal (PayPal Subscriptions).
 *
 * The checkout has already reserved the subscription row; this asks the Edge
 * API to open a PayPal subscription for exactly that row, and after the
 * customer approves, asks again whether the first period is paid. Only the
 * SERVER says "paid" — `onPaid` fires on its answer, never on PayPal's
 * approval alone, because approval is not a charge. If PayPal is slow to
 * settle the first charge, the webhook activates the row later.
 *
 * Loaded under its own SDK namespace: the one-off PayPal panel uses
 * intent=capture, and the two cannot share one SDK instance.
 */

declare global {
  interface Window { paypalSubscriptions?: any }
}

let sdkPromise: { clientId: string; p: Promise<void> } | null = null;
function loadSdk(clientId: string): Promise<void> {
  if (window.paypalSubscriptions) return Promise.resolve();
  if (sdkPromise?.clientId === clientId) return sdkPromise.p;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&currency=USD`;
    s.setAttribute("data-namespace", "paypalSubscriptions");
    s.onload = () => resolve();
    s.onerror = () => { sdkPromise = null; reject(new Error("Failed to load PayPal SDK")); };
    document.head.appendChild(s);
  });
  sdkPromise = { clientId, p };
  return p;
}

interface Props {
  /** The reserved provider_subscriptions row this subscription pays for. */
  getRowId: () => string | null;
  /** Which table the row is in: "beach" | "universal" | "food" | "cleaning". */
  service: string;
  onPaid: (subscriptionId: string) => void;
}

export function PayPalSubscriptionPanel({ getRowId, service, onPaid }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "settling" | "unconfigured" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const rowRef = useRef(getRowId);
  rowRef.current = getRowId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetch(apiUrlFor("/payments/paypal/subscription/config")).then((r) => r.json());
        if (!cfg?.enabled || !cfg?.clientId) { if (!cancelled) setStatus("unconfigured"); return; }
        await loadSdk(cfg.clientId);
        if (cancelled || !ref.current || !window.paypalSubscriptions) return;
        ref.current.innerHTML = "";
        window.paypalSubscriptions
          .Buttons({
            style: { layout: "vertical", color: "blue", shape: "pill", label: "subscribe" },
            createSubscription: async () => {
              setMessage(null);
              const rowId = rowRef.current();
              if (!rowId) throw new Error("Checkout is not ready yet — try again in a second.");
              const { data, error } = await accountApi("/payments/paypal/subscriptions", {
                method: "POST",
                body: JSON.stringify({ row_id: rowId, service }),
              });
              if (error || !data?.id) {
                setMessage(error?.message || "Could not start PayPal.");
                throw error || new Error("no subscription id");
              }
              return data.id as string;
            },
            onApprove: async (data: { subscriptionID: string }) => {
              setStatus("settling");
              // The first charge usually settles within seconds of approval.
              for (let i = 0; i < 10; i++) {
                const { data: r } = await accountApi(
                  `/payments/paypal/subscriptions/${encodeURIComponent(data.subscriptionID)}/activate`,
                  { method: "POST" },
                );
                if (r?.paid) { onPaidRef.current(data.subscriptionID); return; }
                await new Promise((res) => setTimeout(res, 2000));
              }
              setMessage("PayPal has your approval and is finishing the first payment. Your membership switches on as soon as it lands — check My subscriptions in a minute.");
            },
            onError: (err: unknown) => {
              console.error("PayPal subscription error:", err);
              setMessage((m) => m ?? "PayPal could not complete this. Please try again or use another method.");
            },
          })
          .render(ref.current);
        if (!cancelled) setStatus("ready");
      } catch (e) {
        console.error("PayPal subscription panel failed:", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "unconfigured") return <Notice>PayPal is not configured yet. Please use another method.</Notice>;
  if (status === "error") return <Notice>PayPal is unavailable right now. Please use another method.</Notice>;

  return (
    <div className="space-y-3">
      {(status === "loading" || status === "settling") && (
        <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
          <Spinner size="md" className="text-[#0070ba]" />
          {status === "settling" && <span>Confirming your first payment…</span>}
        </div>
      )}
      {message && <Notice>{message}</Notice>}
      <div ref={ref} className={status === "settling" ? "hidden" : undefined} />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-radius-md bg-destructive/10 p-4 text-sm">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <span>{children}</span>
    </div>
  );
}
