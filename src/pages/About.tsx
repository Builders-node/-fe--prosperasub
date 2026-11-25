import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bitcoin, HeartHandshake, Mail, MapPin, MessageCircle, Store, Users } from "lucide-react";

import { LEGAL_CONTACT } from "@/components/legal/LegalPage";
import { ArrowCta, FeatureCard, H1, ICON_TILE, MarketingPage, RenderPanel, TwoTone } from "@/components/marketing/Marketing";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useSeo } from "@/hooks/useSeo";
import { supabaseDb } from "@/integrations/supabase/client";
import { serviceListingHref } from "@/lib/services/serviceUrls";
import { tr } from "@/lib/tr";

/**
 * /about — what EverySub is, where, and how to reach a person. Only facts the
 * product and the contacts page already state; no invented history.
 */

const IMG = "/for-business";

export default function About() {
  const { archetypes } = useServiceArchetypes(true);
  const { data: businesses = 0 } = useQuery({
    queryKey: ["about-business-count"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { count } = await supabaseDb.from("providers").select("id", { count: "exact", head: true }).eq("status", "active");
      return count ?? 0;
    },
  });

  useSeo({
    title: tr("About EverySub — local services on Roatán"),
    description: tr("EverySub is a marketplace for subscriptions, bookings and rentals from local businesses on Roatán, Honduras — paid up front by Lightning, Bitcoin, card or PayPal."),
    path: "/about",
    image: `https://everysub.net${IMG}/hero.jpg`,
    jsonLd: {
      "@context": "https://schema.org", "@type": "AboutPage", name: tr("About EverySub"), url: "https://everysub.net/about",
      mainEntity: {
        "@type": "Organization", name: "EverySub", url: "https://everysub.net", logo: "https://everysub.net/icon-512.png",
        areaServed: "Roatán, Honduras", email: LEGAL_CONTACT.email, telephone: LEGAL_CONTACT.whatsapp,
      },
    },
  });

  return (
    <MarketingPage label={tr("about")} cta={{ to: "/discovery", label: tr("Browse") }}>
      <section className="app-container pb-6 pt-10 text-center md:pb-10 md:pt-20">
        <TwoTone as="h1" style={H1} accent={tr("local services,")} plain={tr("one subscription away")} center />
        <p className="mx-auto mt-5 max-w-[680px] text-body text-muted-foreground md:text-lg">{tr("EverySub is where people on Roatán subscribe to the things they need every week — meals, cleaning, memberships, healthcare, car rental — from the businesses that make them.")}</p>
      </section>

      <RenderPanel image={`${IMG}/panel.jpg`} className="min-h-[320px]">
        <div className="grid gap-6 p-6 text-white md:grid-cols-3 md:p-12">
          {[
            { big: "Roatán", small: tr("Bay Islands, Honduras — started in Próspera") },
            { big: businesses ? String(businesses) : "—", small: tr("local businesses selling today") },
            { big: String(archetypes.length || "—"), small: tr("kinds of service, and growing") },
          ].map((s) => (
            <div key={s.small} className="rounded-radius-xl bg-black/25 p-6 backdrop-blur-md">
              <p className="font-semibold" style={{ fontSize: "clamp(2.25rem, 4.5vw, 3.5rem)", letterSpacing: "-0.04em", lineHeight: 1 }}>{s.big}</p>
              <p className="mt-2 text-body text-white/85">{s.small}</p>
            </div>
          ))}
        </div>
      </RenderPanel>

      <section className="app-container py-16 md:py-24">
        <TwoTone accent={tr("what we do")} plain={tr("this is")} accentFirst={false} />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <FeatureCard icon={Users} title={tr("for customers")}>{tr("One place to find, pay for and manage the services you use — with reminders, access codes and support.")}{" "}<Link to="/how-it-works" className="font-semibold text-foreground underline-offset-4 hover:underline">{tr("How it works")}</Link>
          </FeatureCard>
          <FeatureCard icon={Store} title={tr("for businesses")}>{tr("A page, a checkout, a schedule and payouts — without building any of it. No monthly fee.")}{" "}<Link to="/for-business" className="font-semibold text-foreground underline-offset-4 hover:underline">{tr("Sell on EverySub")}</Link>
          </FeatureCard>
          <FeatureCard icon={Bitcoin} title={tr("bitcoin, done right")}>{tr("Every business here takes Lightning and Bitcoin as well as card and PayPal.")}{" "}<Link to="/pay-with-bitcoin" className="font-semibold text-foreground underline-offset-4 hover:underline">{tr("Paying with Bitcoin")}</Link>
          </FeatureCard>
        </div>
        {archetypes.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {archetypes.map(({ key, label, Icon }) => (
              <Link key={key} to={serviceListingHref(key)} className="flex h-11 items-center gap-2 rounded-full bg-card px-5 text-body font-semibold hover:bg-muted">
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="app-container pb-16 md:pb-24">
        <TwoTone accent={tr("a person")} plain={tr("talk to")} accentFirst={false} />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <a href={LEGAL_CONTACT.whatsappHref} target="_blank" rel="noreferrer" className="rounded-radius-xl bg-card p-6 transition-colors hover:bg-muted/40 md:p-8">
            <span className={ICON_TILE}><MessageCircle className="h-6 w-6" /></span>
            <p className="mt-6 text-title font-semibold">{tr("WhatsApp")}</p>
            <p className="mt-1 text-body text-muted-foreground">{LEGAL_CONTACT.whatsapp}</p>
          </a>
          <a href={`mailto:${LEGAL_CONTACT.email}`} className="rounded-radius-xl bg-card p-6 transition-colors hover:bg-muted/40 md:p-8">
            <span className={ICON_TILE}><Mail className="h-6 w-6" /></span>
            <p className="mt-6 text-title font-semibold">{tr("Email")}</p>
            <p className="mt-1 text-body text-muted-foreground">{LEGAL_CONTACT.email}</p>
          </a>
          <div className="rounded-radius-xl bg-card p-6 md:p-8">
            <span className={ICON_TILE}><MapPin className="h-6 w-6" /></span>
            <p className="mt-6 text-title font-semibold">{tr("Where")}</p>
            <p className="mt-1 text-body text-muted-foreground">{tr("Roatán, Islas de la Bahía, Honduras")}</p>
          </div>
        </div>
        <p className="mt-6 text-body text-muted-foreground">
          <HeartHandshake className="mr-1.5 inline h-4 w-4" />{tr("The fine print:")}{" "}<Link to="/terms" className="font-semibold text-foreground underline-offset-4 hover:underline">{tr("Terms")}</Link> · <Link to="/privacy" className="font-semibold text-foreground underline-offset-4 hover:underline">{tr("Privacy")}</Link>
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <ArrowCta tone="dark" to="/discovery">{tr("Browse services")}</ArrowCta>
          <ArrowCta tone="dark" to="/for-business">{tr("For businesses")}</ArrowCta>
        </div>
      </section>
    </MarketingPage>
  );
}
