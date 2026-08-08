/**
 * The product name, in one place.
 *
 * It was spelled out by hand in roughly twenty components, two locales and the
 * static HTML, so the rebrand meant finding every literal and hoping none were
 * missed. Import this instead of typing the name.
 *
 * Deliberately NOT covered by this constant:
 *
 *  - `prospera_owned_session` / `prospera_google_oauth_state` — localStorage
 *    keys. They're identifiers, not branding; renaming them signs every user
 *    out a second time on top of the domain move, for no visible gain.
 *  - `prosperasub-v3` — the service-worker cache name, scoped per origin.
 *    Renaming evicts every cached asset for existing visitors.
 *  - `api.prosperasub.com` — the API host, which is staying put.
 *  - `support@prosperasub.com` — a mailbox that exists. The everysub.net one
 *    doesn't yet, and an address that bounces is worse than an old one that
 *    works.
 */
export const BRAND_NAME = "EverySub";

/** Full product title used in page titles and share cards. */
export const BRAND_TAGLINE = "Convenience Subscriptions to Próspera";
export const BRAND_TITLE = `${BRAND_NAME} - ${BRAND_TAGLINE}`;
