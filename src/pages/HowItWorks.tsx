import { Bell, CalendarDays, Check, CreditCard, Headphones, LayoutList, QrCode, Repeat, Search, SlidersHorizontal, Sparkles, Star, Utensils } from "lucide-react";

import { LEGAL_CONTACT } from "@/components/legal/LegalPage";
import {
  ArrowCta, FeatureCard, Faq, Glass, GlassRow, H1, H3, MarketingPage, RenderPanel, TwoTone, faqLd,
} from "@/components/marketing/Marketing";
import { useSeo } from "@/hooks/useSeo";
import { cn } from "@/lib/utils";

/**
 * /how-it-works — the customer's side, for search and for the curious.
 * Marketing kit (components/marketing); every line is something the app does.
 */

const IMG = "/for-business";
const PATH = "/how-it-works";

const FAQ = [
  { q: "Do I need Bitcoin to use EverySub?", a: "No. You can pay by card or PayPal, as well as with Lightning or on-chain Bitcoin. Pick whichever you like at checkout." },
  { q: "Will I be charged again automatically?", a: "Only if you turn on auto-renew with PayPal. Otherwise a plan simply ends, and we remind you before it does so you can renew in a tap." },
  { q: "Can I cancel?", a: "Yes, from your account. Some plans — meal plans, for example — can also be paused for a while." },
  { q: "How do I show I'm a member?", a: "Each active subscription has its own access QR in your account. A club or a gym scans it and sees straight away that you're in." },
  { q: "What if something goes wrong?", a: `Write to us on WhatsApp (${LEGAL_CONTACT.whatsapp}) or from Support in the app. Real people answer, and refunds are handled case by case.` },
  { q: "Where does EverySub work?", a: "On Roatán, in the Bay Islands of Honduras — with local businesses across the island." },
];

const STEPS = [
  { icon: Search, title: "Pick a service", text: "Meals, cleaning, memberships, healthcare, car rental — from local businesses, with real reviews." },
  { icon: SlidersHorizontal, title: "Choose what fits", text: "Days a week, meals a day, size, dates — the price updates as you choose." },
  { icon: CreditCard, title: "Pay up front", text: "Lightning, Bitcoin, card or PayPal. No cash, no invoices." },
  { icon: Repeat, title: "It just happens", text: "Deliveries, visits and bookings arrive on schedule, and everything lives in your account." },
];

export default function HowItWorks() {
  useSeo({
    title: "How EverySub works — subscriptions and bookings on Roatán",
    description: "Pick a local service on Roatán, choose your options, pay up front by Lightning, Bitcoin, card or PayPal — then meals, cleaning, memberships and rentals just happen.",
    path: PATH,
    image: `https://everysub.net${IMG}/hero.jpg`,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "HowTo", name: "How to subscribe to a service on EverySub",
          step: STEPS.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.text })),
        },
        faqLd(FAQ),
      ],
    },
  });

  return (
    <MarketingPage
      label="how it works"
      links={[{ href: "#steps", label: "Steps" }, { href: "#faq", label: "Questions" }, { href: "/pay-with-bitcoin", label: "Paying" }]}
      cta={{ to: "/discovery", label: "Browse" }}
    >
      {/* ─── Hero ─── */}
      <section className="app-container pb-6 pt-10 text-center md:pb-10 md:pt-20">
        <TwoTone as="h1" style={H1} accent="subscribe once," plain="it shows up every week" center />
        <p className="mx-auto mt-5 max-w-[640px] text-body text-muted-foreground md:text-lg">
          Meal plans, cleaning, memberships and rentals from local businesses on Roatán — paid up front, managed in one place.
        </p>
        <div className="mt-6 flex justify-center"><ArrowCta tone="dark" to="/discovery">Browse services</ArrowCta></div>
      </section>

      <RenderPanel image={`${IMG}/hero.jpg`}>
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto_1fr] md:p-12">
          <div className="flex flex-col justify-start gap-6 text-white">
            <p className="font-semibold" style={H3}>choose it, pay it, forget about it.</p>
          </div>
          <div className="flex justify-center">
            <Glass className="w-full max-w-[400px] p-5">
              <p className="text-meta text-white/80">Casa Verde Kitchen</p>
              <p className="mt-1 text-title font-semibold">Lunch & dinner</p>
              <p className="mt-4 text-meta text-white/80">Days per week</p>
              <div className="mt-1.5 flex gap-1.5">
                {["Mon–Fri", "Mon–Sat"].map((d, i) => (
                  <span key={d} className={cn("rounded-full px-3.5 py-1.5 text-body font-semibold", i === 0 ? "bg-white text-neutral-900" : "bg-white/10 ring-1 ring-white/20")}>{d}</span>
                ))}
              </div>
              <div className="mt-4 rounded-full bg-white py-3 text-center text-body font-semibold text-neutral-900">Pay $120 / week</div>
              <div className="mt-4 space-y-2">
                <GlassRow icon={Utensils} title="Next delivery" meta="Tomorrow · 12:30" />
                <GlassRow icon={Sparkles} title="Cleaning" meta="Thursday · 10:00" />
                <GlassRow icon={QrCode} title="Beach club access" meta="Show your QR at the door" />
              </div>
            </Glass>
          </div>
          <div className="flex items-end text-white">
            <p className="rounded-radius-md bg-black/30 p-4 text-body backdrop-blur-md md:text-lg">
              Every subscription, booking and rental you have, in one account — with reminders before anything runs out.
            </p>
          </div>
        </div>
      </RenderPanel>

      {/* ─── Steps ─── */}
      <section id="steps" className="app-container scroll-mt-20 py-16 md:py-24">
        <TwoTone accent="four steps" plain="from browsing to done," accentFirst={false} />
        <ol className="mt-10 grid gap-3 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-radius-xl bg-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-body font-semibold text-background">{i + 1}</span>
              <h3 className="mt-6 font-semibold" style={{ fontSize: "1.375rem", letterSpacing: "-0.02em" }}>{s.title}</h3>
              <p className="mt-1 text-body text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── What you get ─── */}
      <section className="app-container pb-16 md:pb-24">
        <TwoTone accent="for you" plain="the boring part, handled" accentFirst={false} />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <FeatureCard icon={LayoutList} title="one account">Every plan, booking and rental — what's next, what's paid, what's ending.</FeatureCard>
          <FeatureCard icon={Bell} title="reminders">We tell you before a plan runs out, so you can renew in a tap.</FeatureCard>
          <FeatureCard icon={QrCode} title="your access QR">Each membership has its own code. The club scans it — no cards, no lists.</FeatureCard>
          <FeatureCard icon={CalendarDays} title="booking that fits">Book a court, a visit or a class in the times the business actually has free.</FeatureCard>
          <FeatureCard icon={Star} title="reviews">Read what other customers said — and businesses answer in public.</FeatureCard>
          <FeatureCard icon={Headphones} title="people who answer">WhatsApp or Support in the app — a person, not a form.</FeatureCard>
        </div>
      </section>

      <Faq items={FAQ} />

      {/* ─── CTA ─── */}
      <section className="px-2 pb-16 md:px-4">
        <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-radius-xl bg-[#2E1803]">
          <img src={`${IMG}/cta.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover object-left" loading="lazy" />
          <div className="absolute inset-0 bg-black/20 md:bg-transparent" />
          <div className="relative grid min-h-[380px] md:grid-cols-2">
            <div className="hidden md:block" />
            <div className="flex flex-col justify-center gap-5 p-6 text-white md:p-14">
              <h2 className="font-semibold" style={{ fontSize: "clamp(2rem, 4.6vw, 4rem)", lineHeight: 1.04, letterSpacing: "-0.03em" }}>find something for your week.</h2>
              <ul className="space-y-1 text-body text-white/85">
                {["Paid up front, no surprises", "Lightning, Bitcoin, card or PayPal", "Cancel from your account"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4" /> {t}</li>
                ))}
              </ul>
              <div><ArrowCta to="/discovery">Browse services</ArrowCta></div>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
