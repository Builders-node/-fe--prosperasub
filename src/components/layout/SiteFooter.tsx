import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { serviceListingHref } from "@/lib/services/serviceUrls";

/**
 * The desktop footer: the site map a laptop visitor scrolls down to look for.
 *
 * On a phone the tab bar does this job, so the footer is desktop-only
 * (`hidden md:block`). Every link goes to a page that exists — services come
 * from `service_archetypes`, so a new service appears here with no code. No
 * social or app-store row: EverySub has neither, and a footer that promises
 * them would be the first broken thing a visitor finds.
 *
 * Flat like the rest of the system: one card surface, no rules between the
 * columns — the columns and the space carry the structure.
 */

const WHATSAPP_NUMBER = "+504 9706-7865";
const WHATSAPP_HREF = "https://wa.me/50497067865";

type FooterLink = { label: string; to: string; external?: boolean };

function Column({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className="min-w-0">
      <p className="text-title font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.to} target="_blank" rel="noreferrer" className="text-body text-muted-foreground transition-colors hover:text-foreground">
                {l.label}
              </a>
            ) : (
              <Link to={l.to} className="text-body text-muted-foreground transition-colors hover:text-foreground">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const { archetypes } = useServiceArchetypes(true);

  const services: FooterLink[] = [
    ...archetypes.map((a) => ({ label: a.label, to: serviceListingHref(a.key) })),
    { label: "Vehicles", to: "/vehicles" },
  ];

  return (
    <footer className="mt-space-8 hidden bg-card md:block">
      <div className="app-container grid grid-cols-4 gap-8 py-10">
        <Column title="EverySub" links={[
          { label: "Home", to: "/discovery" },
          { label: "Search", to: "/search" },
          { label: "Cart", to: "/cart" },
          { label: "My subscriptions", to: "/my-subscriptions" },
        ]} />
        <Column title="Services" links={services} />
        <Column title="For businesses" links={[
          { label: "Sell on EverySub", to: "/for-business" },
          { label: "Become a provider", to: "/become-a-provider" },
          { label: "My business", to: "/my-business" },
          { label: "Talk to us on WhatsApp", to: WHATSAPP_HREF, external: true },
        ]} />
        <Column title="Help" links={[
          { label: "How it works", to: "/how-it-works" },
          { label: "Pay with Bitcoin", to: "/pay-with-bitcoin" },
          { label: "About EverySub", to: "/about" },
          { label: "Support", to: "/support" },
          { label: "My account", to: "/account" },
          { label: "Order history", to: "/history" },
          { label: "Terms of Service", to: "/terms" },
          { label: "Privacy Policy", to: "/privacy" },
        ]} />
      </div>

      <div className="app-container flex items-end justify-between gap-8 pb-10">
        <div>
          <p className="text-meta text-muted-foreground">Questions about an order or a business</p>
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-title font-semibold text-foreground transition-colors hover:text-primary"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-inset">
              <MessageCircle className="h-4 w-4" />
            </span>
            WhatsApp {WHATSAPP_NUMBER}
          </a>
        </div>
        <p className="text-meta text-muted-foreground">
          Pay with Bitcoin, by card or PayPal
        </p>
      </div>

      <div className="bg-inset">
        <div className="app-container py-4">
          <p className="text-meta text-muted-foreground">© EverySub, {new Date().getFullYear()} · Roatán, Honduras</p>
        </div>
      </div>
    </footer>
  );
}

/**
 * What EverySub is, in plain words, at the foot of the home page — for a
 * visitor who scrolled past every tile, and for search engines. The first
 * paragraph is always visible; "Read more" opens the rest in place.
 */
export function AboutEverySub() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-space-8 hidden md:block">
      <div className="app-container py-6">
        <h2 className="text-heading font-semibold text-foreground">
          EverySub — subscriptions for everyday life on Roatán
        </h2>
        <p className="mt-3 max-w-4xl text-body text-muted-foreground">
          Meals delivered to your door every week, a cleaner on the same day each week, a beach club
          membership, a car for the month — EverySub puts the services you use again and again on one
          subscription. Pick a plan, pay for the period up front, and get it on schedule, without
          messaging and chasing every time.
        </p>
        {open && (
          <>
            <p className="mt-3 max-w-4xl text-body text-muted-foreground">
              Every plan is run by a local business on the island. You see what is included, how often
              it comes and what it costs before you pay, and you manage, pause or renew it from My
              subscriptions. Pay with Bitcoin over Lightning or on-chain, by card, or with PayPal.
            </p>
            <p className="mt-3 max-w-4xl text-body text-muted-foreground">
              Run a business on Roatán? Anything your customers buy more than once can become a plan.{" "}
              <Link to="/become-a-provider" className="font-semibold text-foreground underline-offset-4 hover:underline">
                Become a provider
              </Link>{" "}
              — the clients you bring yourself pay no commission.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-4 text-title font-semibold text-foreground transition-colors hover:text-primary"
        >
          {open ? "Show less" : "Read more"}
        </button>
      </div>
    </section>
  );
}
