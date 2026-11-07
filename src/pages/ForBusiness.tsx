import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent, Bell, CalendarDays, ChevronDown, CreditCard, Megaphone, MessageCircle,
  QrCode, Repeat, Star, Store, TicketPercent, Users, Wallet, Zap,
} from "lucide-react";

import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { HomeHeader } from "@/components/layout/HomeHeader";
import { LEGAL_CONTACT } from "@/components/legal/LegalPage";
import { Button } from "@/components/ui/button";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useSeo } from "@/hooks/useSeo";
import { supabaseDb } from "@/integrations/supabase/client";
import { DEFAULT_COMMISSION_KEY } from "@/lib/finance/platformTake";
import { serviceListingHref } from "@/lib/services/serviceUrls";

/**
 * /for-business — the page you send a business you want on the platform,
 * and the one search engines should find for "sell subscriptions in Roatán".
 *
 * Every claim here is something the product does today. The figures that can
 * change (the commission, the services on offer) are read live, so this page
 * can't drift from the truth the way a PDF does.
 */

const APPLY = "/become-a-provider";
const PATH = "/for-business";

function useDefaultCommission() {
  return useQuery({
    queryKey: ["global-setting", DEFAULT_COMMISSION_KEY],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabaseDb.from("global_settings").select("value").eq("key", DEFAULT_COMMISSION_KEY).maybeSingle();
      const n = Number(data?.value);
      return Number.isFinite(n) && n >= 0 ? n : 10;
    },
  });
}

const FEATURES = [
  { icon: Store, title: "Your own page", text: "Photos, hours, location, reviews and every offer you sell — one link to share anywhere." },
  { icon: Repeat, title: "Subscriptions, one-off sales and bookings", text: "Weekly meal plans, monthly cleaning, memberships, hourly courts, tours, rentals by the day." },
  { icon: CreditCard, title: "Paid before you work", text: "Customers pay at checkout by Lightning, Bitcoin or PayPal. No chasing invoices, no cash." },
  { icon: CalendarDays, title: "Schedule that runs itself", text: "Every visit, delivery and booking lands on your schedule and in your own Google Calendar." },
  { icon: Wallet, title: "Withdraw when you like", text: "What you've earned is yours to withdraw any time, straight to a Lightning or Bitcoin address." },
  { icon: Users, title: "Your team in", text: "Invite managers by email. They run the day; only you move the money." },
];

const TOOLS = [
  { icon: Bell, title: "New-order alerts", text: "Email and in-app, the moment someone buys." },
  { icon: CalendarDays, title: "Tomorrow, every morning", text: "A 7am digest of what's on tomorrow." },
  { icon: TicketPercent, title: "Your promo codes", text: "Discounts on your own offers, on your terms." },
  { icon: MessageCircle, title: "Message subscribers", text: "One note to everyone on an active plan." },
  { icon: Star, title: "Reply to reviews", text: "Answer in public, under the review." },
  { icon: Megaphone, title: "Get featured", text: "Pay per order a placement brings, or book a featured week." },
];

const STEPS = [
  { title: "Apply", text: "Tell us what you sell. It takes about five minutes." },
  { title: "We set you up", text: "Your page, offers and schedule — we help you get them right." },
  { title: "Go live", text: "Customers find you on EverySub, or through your own link and QR code." },
  { title: "Get paid", text: "Every sale is paid up front. Withdraw your balance whenever you want." },
];

function faqs(pct: number) {
  return [
    { q: "What does it cost?", a: `Nothing to join and no monthly fee. EverySub keeps ${pct}% of each sale; you keep the rest. Customers you bring yourself — through your own QR code or link — cost you 0%.` },
    { q: "How do I get paid?", a: "Customers pay when they buy, so your balance grows as you deliver. Withdraw it any time to a Lightning address or a Bitcoin address. Prefer something else? Talk to us." },
    { q: "Do my customers need Bitcoin?", a: "No. They can pay with PayPal, as well as with Lightning or Bitcoin." },
    { q: "What can I sell?", a: "Anything that's a subscription, a package, a one-time purchase or a booking: meal plans, cleaning, memberships, classes, courts, tours, vehicle rentals and more." },
    { q: "Can my staff use it?", a: "Yes. Add managers by email; they see the schedule, the customers and the numbers. Only the owner can withdraw money." },
    { q: "Who handles refunds and support?", a: "EverySub runs checkout and customer support with you. If you cancel a customer's plan you can request a refund for them in one tap." },
  ];
}

export default function ForBusiness() {
  const { data: pct = 10 } = useDefaultCommission();
  const { archetypes } = useServiceArchetypes(true);
  const list = faqs(pct);

  useSeo({
    title: "Sell subscriptions and bookings in Roatán",
    description: `Put your business on EverySub: your own page, subscriptions and bookings, payment up front by Lightning, Bitcoin or PayPal, and withdrawals whenever you want. No monthly fee — ${pct}% per sale, 0% on customers you bring.`,
    path: PATH,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          name: "EverySub for business",
          url: `https://everysub.net${PATH}`,
          about: { "@type": "Service", name: "EverySub marketplace for local businesses", areaServed: "Roatán, Honduras" },
        },
        {
          "@type": "FAQPage",
          mainEntity: list.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        },
      ],
    },
  });

  return (
    <BrowseLayout header={<HomeHeader variant="brand" />}>
      <main className="app-container space-y-1 py-4 max-md:px-0 md:space-y-4 md:py-space-8">
        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <section className="rounded-radius-lg bg-card px-4 py-8 md:px-10 md:py-14">
          <p className="text-meta font-semibold text-primary">EverySub for business</p>
          <h1 className="mt-2 max-w-[720px] text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
            Sell subscriptions and bookings in Roatán
          </h1>
          <p className="mt-3 max-w-[620px] text-body text-muted-foreground md:text-lg">
            Your own page, a checkout that takes Lightning, Bitcoin and PayPal, a schedule that fills itself — and your money whenever you want it.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg"><Link to={APPLY}>Apply — about 5 minutes</Link></Button>
            <Button asChild size="lg" variant="secondary">
              <a href={LEGAL_CONTACT.whatsappHref} target="_blank" rel="noreferrer">Talk to us on WhatsApp</a>
            </Button>
          </div>
          <p className="mt-4 text-meta text-muted-foreground">No setup fee · No monthly fee · {pct}% only when you sell</p>
        </section>

        {/* ─── What you get ─────────────────────────────────────────── */}
        <section className="rounded-radius-lg bg-card p-4 md:p-8">
          <h2 className="text-heading font-semibold text-foreground">What you get</h2>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-radius-md bg-inset p-4">
                <Icon className="h-6 w-6 text-foreground" />
                <h3 className="mt-3 text-title font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-body text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Pricing ──────────────────────────────────────────────── */}
        <section className="rounded-radius-lg bg-card p-4 md:p-8">
          <h2 className="text-heading font-semibold text-foreground">Simple pricing</h2>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-radius-md bg-inset p-4">
              <BadgePercent className="h-6 w-6 text-foreground" />
              <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground">{pct}%</p>
              <p className="mt-1 text-body text-muted-foreground">of each sale on EverySub. You keep the rest.</p>
            </div>
            <div className="rounded-radius-md bg-inset p-4">
              <QrCode className="h-6 w-6 text-foreground" />
              <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground">0%</p>
              <p className="mt-1 text-body text-muted-foreground">on customers you bring with your own QR code or link.</p>
            </div>
            <div className="rounded-radius-md bg-inset p-4">
              <Zap className="h-6 w-6 text-foreground" />
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">$0</p>
              <p className="mt-1 text-body text-muted-foreground">to join, and no monthly fee. Promotion is optional.</p>
            </div>
          </div>
        </section>

        {/* ─── How it works ─────────────────────────────────────────── */}
        <section className="rounded-radius-lg bg-card p-4 md:p-8">
          <h2 className="text-heading font-semibold text-foreground">How it works</h2>
          <ol className="mt-4 grid gap-2 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-radius-md bg-inset p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-body font-semibold text-background">{i + 1}</span>
                <h3 className="mt-3 text-title font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1 text-body text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ─── Who it's for (live list of services) ─────────────────── */}
        <section className="rounded-radius-lg bg-card p-4 md:p-8">
          <h2 className="text-heading font-semibold text-foreground">Already selling on EverySub</h2>
          <p className="mt-1 text-body text-muted-foreground">Join a service that's live, or bring a new kind of business — we'll open it for you.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {archetypes.map(({ key, label, Icon }) => (
              <Link key={key} to={serviceListingHref(key)} className="flex h-10 items-center gap-2 rounded-full bg-inset px-4 text-body font-semibold text-foreground hover:bg-muted">
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
            <Link to={APPLY} className="flex h-10 items-center rounded-full bg-inset px-4 text-body font-semibold text-muted-foreground hover:bg-muted">
              Something else?
            </Link>
          </div>
        </section>

        {/* ─── Tools ────────────────────────────────────────────────── */}
        <section className="rounded-radius-lg bg-card p-4 md:p-8">
          <h2 className="text-heading font-semibold text-foreground">Tools to grow</h2>
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            {TOOLS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-inset">
                  <Icon className="h-5 w-5 text-foreground" />
                </span>
                <span className="min-w-0">
                  <span className="block text-title font-semibold text-foreground">{title}</span>
                  <span className="block text-body text-muted-foreground">{text}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────────────── */}
        <section className="rounded-radius-lg bg-card p-4 md:p-8">
          <h2 className="text-heading font-semibold text-foreground">Questions</h2>
          <div className="mt-3 divide-y divide-border/60">
            {list.map((f) => (
              <details key={f.q} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-title font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-body text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ─── Final CTA ────────────────────────────────────────────── */}
        <section className="rounded-radius-lg bg-card px-4 py-8 text-center md:py-12">
          <h2 className="text-heading font-semibold text-foreground md:text-3xl">Ready to sell on EverySub?</h2>
          <p className="mt-2 text-body text-muted-foreground">Apply now, or ask us anything first — {LEGAL_CONTACT.whatsapp}.</p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild size="lg"><Link to={APPLY}>Apply now</Link></Button>
            <Button asChild size="lg" variant="secondary">
              <a href={LEGAL_CONTACT.whatsappHref} target="_blank" rel="noreferrer">WhatsApp us</a>
            </Button>
          </div>
        </section>
      </main>
    </BrowseLayout>
  );
}
