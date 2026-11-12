import { useEffect } from "react";
import { accountApi } from "@/integrations/supabase/client";

/**
 * The sales funnel, as seen from the browser (Edge routes/funnel.ts).
 *
 *   provider_view → plan_view → checkout_start → payment_chosen → (paid, from the orders)
 *
 * One random id per browser tab session (sessionStorage) is all that is sent
 * — no fingerprint. The server keeps one row per session, stage, plan and day,
 * so calling this on every render is harmless; it is still sent at most once
 * per tab for the same stage and plan. Never throws, never waits: a funnel is
 * not worth a slower page.
 */

export type FunnelStage = "provider_view" | "plan_view" | "checkout_start" | "payment_chosen";

const KEY = "prospera_funnel_session";
const sent = new Set<string>();

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^0-9a-zA-Z_-]/g, "");
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "nosession-" + Math.random().toString(36).slice(2, 12);
  }
}

export function trackFunnel(stage: FunnelStage, providerId: string | null | undefined, planRef?: string | null) {
  if (!providerId) return;
  // Admins previewing a draft and the business looking at its own page would
  // skew a small business's numbers; previews are excluded by the caller.
  const key = `${stage}:${providerId}:${planRef ?? ""}`;
  if (sent.has(key)) return;
  sent.add(key);
  void accountApi("/funnel/events", {
    method: "POST",
    body: JSON.stringify({ providerId, planRef: planRef ?? null, stage, sessionId: sessionId() }),
  }).catch(() => undefined);
}

/** The same, as an effect: fires once the ids are known. */
export function useTrackFunnel(stage: FunnelStage, providerId: string | null | undefined, planRef?: string | null, enabled = true) {
  useEffect(() => {
    if (enabled) trackFunnel(stage, providerId, planRef);
  }, [stage, providerId, planRef, enabled]);
}
