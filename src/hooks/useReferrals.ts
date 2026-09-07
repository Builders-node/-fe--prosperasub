import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Bring a neighbour.
 *
 * A referral spans two visits that can be weeks apart: someone opens a shared
 * link today and signs up on Thursday. The code therefore has to survive in
 * the browser between those two moments, and be handed over the instant there
 * is an account to attach it to — which is what `useReferralCapture` does,
 * mounted once at the top of the app.
 *
 * The claim itself goes to the server authenticated, so the person being
 * referred is taken from their token rather than from the request body: a code
 * is public by design and anyone could otherwise name themselves as somebody
 * else's referrer. The REWARD is not here at all — a database trigger grants
 * it when the friend's first order is paid, because three different writers
 * mark an order paid and only the database sees all three.
 */

const STORED_CODE_KEY = "prospera_referral_code";
/** A code someone picked up months ago is a coincidence, not a referral. */
const CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ReferralSummary {
  enabled: boolean;
  code: string | null;
  rewardCents: number;
  welcomeCents: number;
  balanceCents: number;
  earnedCents: number;
  invited: Array<{ name: string; status: string; joinedAt: string }>;
  credits: Array<{ amountCents: number; reason: string; note: string | null; createdAt: string }>;
}

const readStoredCode = (): string | null => {
  try {
    const raw = localStorage.getItem(STORED_CODE_KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (!code || Date.now() - at > CODE_TTL_MS) {
      localStorage.removeItem(STORED_CODE_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
};

const storeCode = (code: string) => {
  try {
    localStorage.setItem(STORED_CODE_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // A private window that refuses storage loses the attribution, not the visit.
  }
};

const clearStoredCode = () => {
  try { localStorage.removeItem(STORED_CODE_KEY); } catch { /* see above */ }
};

/** `?ref=9C37UX` on any URL. Kept out of the router so a link to any page works. */
const codeFromLocation = (): string | null => {
  try {
    const raw = new URLSearchParams(window.location.search).get("ref");
    const code = (raw ?? "").trim().toUpperCase();
    return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
  } catch {
    return null;
  }
};

/**
 * Mounted once, at the top of the app.
 *
 * Two jobs, in order: remember a code that arrives on the URL, and hand over a
 * remembered code as soon as somebody is signed in. The server decides whether
 * it counts — an existing customer cannot be back-attributed — so a refusal
 * here is a normal answer and clears the code just the same.
 */
export function useReferralCapture() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const fromUrl = codeFromLocation();
    if (fromUrl) storeCode(fromUrl);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const code = readStoredCode();
    if (!code) return;

    let cancelled = false;
    void (async () => {
      // accountApi reports failures in `error` rather than throwing, so both
      // shapes have to be handled: the endpoint may simply not be deployed yet.
      const { error } = await accountApi("/account/referrals/claim", {
        method: "POST",
        body: JSON.stringify({ code }),
      }).catch(() => ({ error: new Error("unreachable") }));

      // Quiet either way: a new customer must never meet a referral error on
      // top of their first sign-in. A code that was refused stays put and
      // expires on its own; a claim that landed is spent.
      if (!cancelled && !error) clearStoredCode();
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated]);
}

export function useReferrals() {
  const { isAuthenticated } = useAuth();

  return useQuery<ReferralSummary>({
    queryKey: ["account-referrals"],
    enabled: isAuthenticated,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await accountApi("/account/referrals");
      if (error) throw error;
      return data as ReferralSummary;
    },
  });
}

/** For the "I already have a code" box on the referrals screen. */
export function useClaimReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await accountApi("/account/referrals/claim", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      if (error) throw error;
      return data as { claimed: boolean; reason?: string };
    },
    onSuccess: () => {
      clearStoredCode();
      void queryClient.invalidateQueries({ queryKey: ["account-referrals"] });
    },
  });
}

export const referralLinkFor = (code: string) =>
  `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
