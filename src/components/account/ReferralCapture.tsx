import { useReferralCapture } from "@/hooks/useReferrals";

/**
 * Renders nothing; exists so the referral code that arrives on a shared link
 * survives until there is an account to attach it to.
 *
 * Mounted once, high in the tree, because the link can point at any page —
 * a plan, a provider, the home screen — and the visitor usually signs up
 * several taps later, sometimes days later.
 */
export function ReferralCapture() {
  useReferralCapture();
  return null;
}
