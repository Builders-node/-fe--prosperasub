import { tr } from "@/lib/tr";
/**
 * Why a customer left — the one question, asked in the cancel dialog and from
 * the reminder emails (backend LEAVE_REASONS uses the same keys). Fixed answers
 * so they can be counted; `churn_feedback.reason` only accepts these.
 */
export const LEAVE_REASONS = [
  { key: "moved", label: tr("I'm leaving the island") },
  { key: "price", label: tr("Too expensive") },
  { key: "quality", label: tr("Wasn't happy with it") },
  { key: "forgot", label: tr("Forgot to renew") },
  { key: "other", label: tr("Something else") },
] as const;

export type LeaveReason = (typeof LEAVE_REASONS)[number]["key"];

export const isLeaveReason = (v: unknown): v is LeaveReason =>
  LEAVE_REASONS.some((r) => r.key === v);

/** The services the feedback endpoint knows — the same slugs as cancel/resume. */
export const FEEDBACK_SERVICES = ["food", "cleaning", "beach", "plan"] as const;
