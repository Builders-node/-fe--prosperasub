/**
 * Why a customer left — the one question, asked in the cancel dialog and from
 * the reminder emails (backend LEAVE_REASONS uses the same keys). Fixed answers
 * so they can be counted; `churn_feedback.reason` only accepts these.
 */
export const LEAVE_REASONS = [
  { key: "moved", label: "I'm leaving the island" },
  { key: "price", label: "Too expensive" },
  { key: "quality", label: "Wasn't happy with it" },
  { key: "forgot", label: "Forgot to renew" },
  { key: "other", label: "Something else" },
] as const;

export type LeaveReason = (typeof LEAVE_REASONS)[number]["key"];

export const isLeaveReason = (v: unknown): v is LeaveReason =>
  LEAVE_REASONS.some((r) => r.key === v);

/** The services the feedback endpoint knows — the same slugs as cancel/resume. */
export const FEEDBACK_SERVICES = ["food", "cleaning", "beach", "plan"] as const;
