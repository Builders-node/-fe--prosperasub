import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const API_URL = (import.meta.env.VITE_API_URL as string) || "https://api.prosperasub.com";

interface Props {
  totalCents: number;
  onPaid: (captureId: string) => void;
  /** Extra fields sent with the order (description, service_name, client_name, …) for admin notifications. */
  orderMeta?: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { paypal?: any }
}

/**
 * True when an event target lives inside PayPal's checkout overlay/iframe.
 * PayPal renders its checkout to document.body (a "zoid" iframe), so without
 * this guard a Radix Dialog/Sheet treats tapping it as an outside interaction
 * and dismisses — which on mobile reads as the checkout closing on focus.
 */
export function isPayPalDomNode(node: EventTarget | null): boolean {
  let el = node as HTMLElement | null;
  let depth = 0;
  while (el && depth < 15) {
    const tag = (el.tagName || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const cls = typeof el.className === "string" ? el.className.toLowerCase() : "";
    const name = (el.getAttribute?.("name") || "").toLowerCase();
    const src = tag === "iframe" ? (el.getAttribute?.("src") || "").toLowerCase() : "";
    if (/paypal|zoid|xcomponent/.test(`${id} ${cls} ${name} ${src}`)) return true;
    el = el.parentElement;
    depth++;
  }
  return false;
}

/** Radix outside-interaction guard: keep the modal open while interacting with PayPal. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function guardPayPalOutside(event: any) {
  const orig = event?.detail?.originalEvent;
  const target = orig?.target ?? orig?.relatedTarget ?? document.activeElement;
  if (isPayPalDomNode(target)) event.preventDefault();
}

let sdkPromise: Promise<void> | null = null;
function loadPayPalSdk(clientId: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    s.onload = () => resolve();
    s.onerror = () => { sdkPromise = null; reject(new Error("Failed to load PayPal SDK")); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 p-4 text-sm">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <span>{children}</span>
    </div>
  );
}

export function PayPalPanel({ totalCents, onPaid, orderMeta }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "unconfigured" | "error">("loading");
  const containerRef = useRef<HTMLDivElement>(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const totalRef = useRef(totalCents);
  totalRef.current = totalCents;
  const metaRef = useRef(orderMeta);
  metaRef.current = orderMeta;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetch(`${API_URL}/payments/paypal/config`).then((r) => r.json());
        if (!cfg?.enabled || !cfg?.clientId) {
          if (!cancelled) setStatus("unconfigured");
          return;
        }
        await loadPayPalSdk(cfg.clientId);
        if (cancelled || !containerRef.current || !window.paypal) return;
        containerRef.current.innerHTML = "";

        window.paypal
          .Buttons({
            style: { layout: "vertical", color: "blue", shape: "pill", label: "pay" },
            createOrder: async () => {
              const d = await fetch(`${API_URL}/payments/paypal/order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount_cents: totalRef.current, ...(metaRef.current ?? {}) }),
              }).then((r) => r.json());
              if (!d.id) throw new Error(d.message || "Could not create PayPal order");
              return d.id;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onApprove: async (data: any) => {
              // Retry once — capture is idempotent server-side, so a transient
              // failure can be recovered without double-charging or losing the plan.
              let lastErr: unknown;
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  const d = await fetch(`${API_URL}/payments/paypal/capture`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ order_id: data.orderID }),
                  }).then((r) => r.json());
                  if (d.paid) { onPaidRef.current(d.capture_id || data.orderID); return; }
                  lastErr = new Error(d.message || "PayPal payment was not completed");
                } catch (e) {
                  lastErr = e;
                }
                await new Promise((r) => setTimeout(r, 1500));
              }
              throw lastErr ?? new Error("PayPal payment was not completed");
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onError: (err: any) => console.error("PayPal error:", err),
          })
          .render(containerRef.current);

        if (!cancelled) setStatus("ready");
      } catch (e) {
        console.error("PayPal panel failed:", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "unconfigured") return <Notice>PayPal is not configured yet. Please use another method.</Notice>;
  if (status === "error") return <Notice>PayPal is unavailable right now. Please use another method.</Notice>;

  return (
    <div>
      {status === "loading" && (
        <div className="flex justify-center p-6">
          <Spinner size="md" className="text-[#0070ba]" />
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
