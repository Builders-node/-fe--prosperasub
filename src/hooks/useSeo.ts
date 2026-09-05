import { useEffect } from "react";

/**
 * What a page says it is.
 *
 * Every URL served the same title, description and Open Graph card, because
 * they are baked into index.html and nothing ever changed them: a shared link
 * to a specific plan showed "EverySub — Convenience Subscriptions to Próspera"
 * and a tab full of identical bookmarks read as one page.
 *
 * This sets them per page and restores the document defaults on the way out,
 * so a screen never leaves its title behind on the next one.
 *
 * What it does NOT do, and cannot: WhatsApp, Facebook and Twitter fetch the
 * HTML without running JavaScript, so a crawler-facing preview still needs
 * server-rendered tags. Googlebot does render, so this reaches search; the
 * social card is the next piece of work, not something a hook can fix.
 */
export interface SeoInput {
  /** Page title, without the brand — " · EverySub" is appended. */
  title?: string | null;
  description?: string | null;
  /** Absolute or app-relative; becomes canonical and og:url. */
  path?: string | null;
  image?: string | null;
  /** "website" for a listing, "product" for something with a price. */
  type?: "website" | "product" | "article";
  /** JSON-LD for the thing on this page. Google reads it after rendering. */
  jsonLd?: Record<string, unknown> | null;
}

const SITE = "https://everysub.net";
const BRAND = "EverySub";
const JSON_LD_ID = "seo-json-ld";

function setMeta(selector: string, attr: "name" | "property", key: string, value: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!value) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setLink(rel: string, href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function useSeo({ title, description, path, image, type = "website", jsonLd }: SeoInput) {
  const url = path ? (path.startsWith("http") ? path : `${SITE}${path}`) : null;
  const fullTitle = title ? `${title} · ${BRAND}` : null;

  useEffect(() => {
    // Remember what was there so leaving restores it — otherwise a plan's
    // title follows the customer back to the home screen.
    const previousTitle = document.title;
    const previousDescription = document.head
      .querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null;

    if (fullTitle) document.title = fullTitle;
    if (description) setMeta('meta[name="description"]', "name", "description", description);
    if (fullTitle) {
      setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
      setMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    }
    if (description) {
      setMeta('meta[property="og:description"]', "property", "og:description", description);
      setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    }
    if (url) {
      setMeta('meta[property="og:url"]', "property", "og:url", url);
      setLink("canonical", url);
    }
    if (image) {
      setMeta('meta[property="og:image"]', "property", "og:image", image);
      setMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
    }
    setMeta('meta[property="og:type"]', "property", "og:type", type);

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = JSON_LD_ID;
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null) {
        setMeta('meta[name="description"]', "name", "description", previousDescription);
      }
      setLink("canonical", null);
      script?.remove();
    };
  }, [fullTitle, description, url, image, type, JSON.stringify(jsonLd ?? null)]);
}

/** Schema.org for one thing that can be bought, priced in whole dollars. */
export function offerJsonLd(input: {
  name: string; description?: string | null; image?: string | null;
  priceCents?: number | null; url: string; providerName?: string | null;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.providerName ? { brand: { "@type": "Organization", name: input.providerName } } : {}),
    ...(input.priceCents
      ? {
          offers: {
            "@type": "Offer",
            price: (input.priceCents / 100).toFixed(2),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: input.url.startsWith("http") ? input.url : `${SITE}${input.url}`,
          },
        }
      : {}),
  };
}

/** Schema.org for a business page. */
export function businessJsonLd(input: {
  name: string; description?: string | null; image?: string | null;
  url: string; phone?: string | null; email?: string | null; address?: string | null;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.name,
    url: input.url.startsWith("http") ? input.url : `${SITE}${input.url}`,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.phone ? { telephone: input.phone } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.address ? { address: { "@type": "PostalAddress", streetAddress: input.address } } : {}),
  };
}
