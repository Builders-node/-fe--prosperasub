/**
 * Does this look like somewhere we can send money — and does it match the rail
 * the person picked?
 *
 * The server decides for real (`backend/src/payments/payout-destination.ts`,
 * which this mirrors); nothing here is trusted. It exists so the answer arrives
 * while the field is still being typed into, rather than after a button that
 * says the payment cannot be pulled back.
 *
 * Keep the two in step. They are deliberately duplicated rather than shared,
 * because the browser bundle and the API do not share a module — but a change
 * to one is a change to both.
 */

export type PayoutRail = "lightning" | "onchain";

const LN_ADDRESS = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const ONCHAIN = /^(bc1[a-z0-9]{20,80}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/;
const INVOICE = /^lnbc[0-9a-z]+$/i;

/** Strip the `lightning:` / `bitcoin:` a wallet's copy button adds. */
export function bareDestination(raw: string): string {
  return (raw ?? "").trim().replace(/^(lightning:|bitcoin:)/i, "").split("?")[0].trim();
}

export const RAIL_LABEL: Record<PayoutRail, string> = {
  lightning: "Lightning",
  onchain: "Bitcoin",
};

export const RAIL_PLACEHOLDER: Record<PayoutRail, string> = {
  lightning: "you@wallet.com",
  onchain: "bc1…",
};

export const RAIL_HINT: Record<PayoutRail, string> = {
  lightning: "Instant, tiny fee. Your wallet's Lightning address — the one shaped like an email.",
  onchain: "Slower and costs a network fee. A Bitcoin address from your wallet's Receive screen.",
};

/**
 * `null` when it is fine. Otherwise the sentence to put under the field.
 *
 * The interesting case is not junk, it is an address that is perfectly valid
 * on the OTHER rail: pasting a Bitcoin address under Lightning is the mistake
 * a real person makes, and it should read as "you're on the wrong tab", not as
 * "that is not an address".
 */
export function destinationProblem(rail: PayoutRail, raw: string): string | null {
  const value = bareDestination(raw);
  if (!value) return null; // Not an error yet — just not filled in.

  if (INVOICE.test(value)) {
    return "That's an invoice, not an address. It has its own amount and expires — use your Lightning address instead.";
  }

  if (rail === "lightning") {
    if (LN_ADDRESS.test(value)) return null;
    if (ONCHAIN.test(value)) return "That's a Bitcoin address — switch to Bitcoin above to send it there.";
    return "A Lightning address looks like an email: you@wallet.com.";
  }

  if (ONCHAIN.test(value)) return null;
  if (LN_ADDRESS.test(value)) return "That's a Lightning address — switch to Lightning above to send it there.";
  return "A Bitcoin address starts with bc1, 1 or 3.";
}

export function isPayable(rail: PayoutRail, raw: string): boolean {
  return !!bareDestination(raw) && destinationProblem(rail, raw) === null;
}
