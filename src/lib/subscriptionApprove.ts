/**
 * Single client-side helper for the "customer paid — mark the row paid" flow.
 *
 * Before this file, every service (cleaning / food / beach / cars) had its own
 * inline mutation, and Beach + Cars had none at all — so pending rows just
 * silently piled up. The audit says nearly every P0 in the approve flow comes
 * from that gap.
 *
 * This helper writes the same shape of patch to whichever legacy table owns the
 * row, plus an audit event, so a caller can wire "Approve" or "Mark paid" in
 * one line no matter where they sit.
 *
 * ── Semantics ──────────────────────────────────────────────────────────────
 * approve() is a **payment confirmation** — it does NOT extend end_date. If you
 * want to also extend the period ("Renew, payment received"), use the existing
 * renew mutations in Subscriptions.tsx / RestaurantSubscriptionsTab.tsx /
 * BeachClubSubscriptions.tsx / CleaningSubscriptionsList.tsx — keep the two
 * concepts separate so an admin can approve a manual cash top-up without
 * accidentally sliding the customer's period out.
 */
import { supabaseDb } from "@/integrations/supabase/client";
import { logAuditEvent, type AuditAction, type EntityType } from "@/lib/auditLog";

export type ApproveService = "cleaning" | "food" | "beach" | "cars";

interface TableMeta {
  table: string;
  auditEntity: EntityType;
  statusField: string;
  /** Value to write on the lifecycle status field when approving. */
  activeValue: string;
  /** For cleaning, also flip is_active TRUE. */
  extraOnApprove?: Record<string, unknown>;
}

const META: Record<ApproveService, TableMeta> = {
  cleaning: {
    table: "cleaning_subscriptions",
    auditEntity: "cleaning_subscription",
    statusField: "subscription_status",
    activeValue: "active",
    extraOnApprove: { is_active: true },
  },
  food: {
    table: "food_subscriptions",
    auditEntity: "food_subscription",
    statusField: "status",
    activeValue: "active",
  },
  beach: {
    table: "beach_club_subscriptions",
    auditEntity: "beach_subscription",
    statusField: "status",
    activeValue: "active",
  },
  cars: {
    table: "rental_bookings",
    auditEntity: "rental_booking",
    statusField: "status",
    // Cars uses booking-model verbs (confirmed = the rental will happen).
    activeValue: "confirmed",
  },
};

export interface ApproveOpts {
  /** admin_user_id for the audit log. Pass userData?.id from useAuth(). */
  adminUserId?: string | null;
  /** Payment method to stamp when the row currently has none. Defaults to
   *  "manual" — the audit specifically calls out Food.approve leaving this
   *  blank, so we always fill it. */
  paymentMethod?: string;
  /** Optional reference to record alongside the manual capture. */
  paymentReference?: string | null;
  /** Also flip the lifecycle status to active/confirmed. Defaults to true —
   *  set false when you just want to fix the payment badge on a row that's
   *  already at the right lifecycle (e.g. bumping paypal-confirmed rows). */
  activate?: boolean;
}

/**
 * Mark a subscription / booking row as paid. Idempotent — writing paid on a
 * paid row is a no-op safe to retry.
 */
export async function approvePayment(
  service: ApproveService,
  id: string,
  opts: ApproveOpts = {},
): Promise<void> {
  const meta = META[service];
  const activate = opts.activate ?? true;

  // Read current row so we only stamp payment_method when it's missing (never
  // overwrite an existing method), and so we don't uselessly flip active on
  // already-active rows.
  const { data: existing, error: readErr } = await supabaseDb
    .from(meta.table)
    .select(`payment_method, payment_status, ${meta.statusField}`)
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;

  const patch: Record<string, unknown> = {
    payment_status: "paid",
    updated_at: new Date().toISOString(),
  };
  const currentMethod = (existing as any)?.payment_method;
  if (!currentMethod) patch.payment_method = opts.paymentMethod || "manual";
  if (opts.paymentReference) patch.payment_reference = opts.paymentReference;
  if (activate) {
    patch[meta.statusField] = meta.activeValue;
    if (meta.extraOnApprove) Object.assign(patch, meta.extraOnApprove);
  }

  const { error } = await supabaseDb.from(meta.table).update(patch).eq("id", id);
  if (error) throw error;

  if (opts.adminUserId) {
    await logAuditEvent(opts.adminUserId, "approve" as AuditAction, meta.auditEntity, id, patch);
  }
}

/** True when a row should offer an "Approve" / "Mark paid" action. */
export function isPendingPayment(row: { payment_status?: string | null } | null | undefined): boolean {
  if (!row) return false;
  const s = String(row.payment_status ?? "").toLowerCase();
  return s !== "" && s !== "paid" && s !== "refunded";
}

/**
 * Canonical payment_method options for admin create/edit forms. Services used
 * to define their own local arrays — Beach shipped `infinita`, Food shipped
 * `crypto`, cleaning had no select at all. Display + grouping normalize both
 * ("crypto" → "infinita" in PaymentMethodBadge; "crypto" → "lives" in
 * FinanceBreakdown), so the divergence was cosmetic — but adding new subs from
 * different admin surfaces would still stamp inconsistent values.
 *
 * Order is stable: manual first (most common admin-side capture), providers
 * grouped by kind (crypto rails → cards).
 */
export const PAYMENT_METHOD_OPTIONS = [
  { value: "manual",    label: "Manual / cash" },
  { value: "lightning", label: "Lightning" },
  { value: "onchain",   label: "On-chain BTC" },
  { value: "infinita",  label: "LIVES / Infinita (Solana)" },
  { value: "paypal",    label: "PayPal" },
] as const;

/**
 * Normalize any historical payment_method value into a canonical key from
 * PAYMENT_METHOD_OPTIONS. Handles legacy `crypto` / `solana` / `lives`
 * aliases and empty strings. Return `null` if we can't map (surface as
 * "manual" at the call site — never lose the row).
 */
export function canonicalPaymentMethod(m: string | null | undefined): string | null {
  const s = String(m ?? "").toLowerCase().trim();
  if (!s) return null;
  if (s === "crypto" || s === "solana" || s === "lives") return "infinita";
  if (s === "blink" || s === "ln") return "lightning";
  if (s === "bitcoin" || s === "btc") return "onchain";
  if (s === "cash" || s === "manual" || s === "free") return "manual";
  return s;
}
