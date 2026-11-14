import { ChevronDown } from "lucide-react";
import type { ServiceSeo } from "@/lib/seo/serviceSeo";

/**
 * The questions people ask before buying, at the foot of a service listing.
 *
 * The same answers go out as FAQPage JSON-LD (see lib/seo/serviceSeo) — Google
 * only trusts structured answers a visitor can also read. Native
 * <details>, so it opens without JavaScript and reads in order for a screen
 * reader.
 */
export function ServiceFaq({ faq, title = "Questions" }: { faq: ServiceSeo["faq"]; title?: string }) {
  if (!faq.length) return null;
  return (
    <section aria-labelledby="service-faq" className="mt-space-6">
      <h2 id="service-faq" className="mb-3 text-heading font-semibold text-foreground">{title}</h2>
      <div className="space-y-1">
        {faq.map((f) => (
          <details key={f.q} className="group rounded-radius-lg bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-title font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-4 text-body text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
