/**
 * How a customer reaches a human — one place, so the support page, the footer
 * and the legal pages can never show two different numbers again.
 *
 * The mailbox stays on the old domain until everysub.net mail is live: a
 * support address that bounces is worse than none.
 */
export const SUPPORT_EMAIL = "support@prosperasub.com";
export const SUPPORT_WHATSAPP = "+504 9706-7865";
export const SUPPORT_WHATSAPP_HREF = `https://wa.me/${SUPPORT_WHATSAPP.replace(/[^0-9]/g, "")}`;
