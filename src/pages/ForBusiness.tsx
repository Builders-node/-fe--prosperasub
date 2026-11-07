import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgePercent, Bell, Bitcoin, CalendarDays, CarFront, Check, ChevronDown,
  CreditCard, Headphones, Megaphone, MessageCircle, QrCode, Sparkles, Star, Store, TicketPercent, Users,
  Utensils, Wallet, Zap,
} from "lucide-react";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { LEGAL_CONTACT } from "@/components/legal/LegalPage";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { useSeo } from "@/hooks/useSeo";
import { supabaseDb } from "@/integrations/supabase/client";
import { DEFAULT_COMMISSION_KEY } from "@/lib/finance/platformTake";
import { serviceListingHref } from "@/lib/services/serviceUrls";
import { cn } from "@/lib/utils";

/**
 * /for-business — the page you send a business you want on the platform, and
 * the one search engines should find for "sell subscriptions in Roatán".
 *
 * A marketing page, so it steps outside the app's flat cards on purpose: big
 * two-tone headlines, rendered glass panels with the product's real screens
 * drawn on top in HTML (so they stay sharp and true). The colour fields are
 * images in /public/for-business — no CSS gradients.
 *
 * Every claim is something the product does today; the figures that change
 * (the commission, the services on offer) are read live.
 */

const APPLY = "/become-a-provider";
const PATH = "/for-business";
const IMG = "/for-business";

/** Display sizes, fluid between phone and desktop. */
const H1: CSSProperties = { fontSize: "clamp(2.4rem, 6.4vw, 5.6rem)", lineHeight: 1.02, letterSpacing: "-0.035em" };
const H2: CSSProperties = { fontSize: "clamp(2rem, 4.6vw, 4rem)", lineHeight: 1.04, letterSpacing: "-0.03em" };
const H3: CSSProperties = { fontSize: "clamp(1.5rem, 2.6vw, 2.25rem)", lineHeight: 1.1, letterSpacing: "-0.02em" };

/** The accent line of a headline: deep amber on light (readable), brand amber on dark. */
const ACCENT = "text-[hsl(var(--brand-accent-active))] dark:text-primary";

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

// ─── Small building blocks ───────────────────────────────────────────────────

/** The page's call to action: a pill with the arrow in its own amber disc. */
function ArrowCta({ to, href, children, tone = "light", className }: {
  to?: string; href?: string; children: ReactNode; tone?: "light" | "dark" | "glass"; className?: string;
}) {
  const cls = cn(
    "group inline-flex h-12 items-center gap-3 rounded-full pl-1.5 pr-5 text-body font-semibold transition-transform active:scale-[0.98]",
    tone === "light" && "bg-white text-neutral-900 hover:bg-white/90",
    tone === "dark" && "bg-foreground text-background hover:opacity-90",
    tone === "glass" && "bg-white/10 pl-5 text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/20",
    className,
  );
  const inner = (
    <>
      {tone !== "glass" && (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:translate-x-0.5">
          <ArrowRight className="h-4 w-4" />
        </span>
      )}
      {children}
    </>
  );
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>;
  return <Link to={to ?? APPLY} className={cls}>{inner}</Link>;
}

/** Frosted glass over the rendered backgrounds. */
function Glass({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-radius-xl bg-white/15 text-white ring-1 ring-white/35 backdrop-blur-xl", className)}>
      {children}
    </div>
  );
}

function GlassRow({ icon: Icon, title, meta, value }: { icon: typeof Store; title: string; meta?: string; value?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-radius-md bg-white/10 px-3 py-2.5 ring-1 ring-white/20">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold">{title}</span>
        {meta && <span className="block truncate text-meta text-white/75">{meta}</span>}
      </span>
      {value && <span className="shrink-0 text-body font-semibold tabular-nums">{value}</span>}
    </div>
  );
}

/** A section heading in two tones: the accent line, then the plain one. */
function TwoTone({ accent, plain, accentFirst = true, center, as: Tag = "h2", style = H2 }: {
  accent: string; plain: string; accentFirst?: boolean; center?: boolean; as?: "h1" | "h2"; style?: CSSProperties;
}) {
  return (
    <Tag className={cn("font-semibold text-foreground", center && "text-center")} style={style}>
      {accentFirst ? (<><span className={cn("block", ACCENT)}>{accent}</span><span className="block">{plain}</span></>)
        : (<><span className="block">{plain}</span><span className={cn("block", ACCENT)}>{accent}</span></>)}
    </Tag>
  );
}

// ─── The screens drawn on the glass ──────────────────────────────────────────

function BalanceMock() {
  return (
    <Glass className="w-full max-w-[400px] p-5">
      <p className="text-center text-meta text-white/80">Available to withdraw</p>
      <p className="mt-1 text-center font-semibold tabular-nums" style={{ fontSize: "clamp(2.25rem, 4vw, 3.25rem)", letterSpacing: "-0.03em" }}>
        $1,284.50
      </p>
      <div className="mt-2 flex justify-center">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-meta">This week <ArrowUpRight className="h-3 w-3" /></span>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2 text-center">
        {([[Wallet, "Withdraw"], [CalendarDays, "Schedule"], [Users, "Customers"], [Megaphone, "Promote"]] as const).map(([Icon, label]) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-neutral-900"><Icon className="h-5 w-5" /></span>
            <span className="text-meta text-white/85">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-2">
        <GlassRow icon={Utensils} title="Weekly meal plan" meta="New subscriber" value="+$120.00" />
        <GlassRow icon={Sparkles} title="Deep clean" meta="2 visits" value="+$85.00" />
        <GlassRow icon={CarFront} title="Jeep · 3 days" meta="Paid by Lightning" value="+$210.00" />
      </div>
    </Glass>
  );
}

const FEATURES: Array<{ key: string; title: string; lead: string; points: string[]; mock: () => ReactNode }> = [
  {
    key: "page",
    title: "your page",
    lead: "A storefront that sells while you work — one link for Instagram, WhatsApp and the QR code on your counter.",
    points: ["Photos, hours, location and reviews", "Every plan and offer with its price", "Your own QR code — 0% on those customers", "Found by people browsing EverySub"],
    mock: () => (
      <Glass className="w-full max-w-[340px] overflow-hidden p-0">
        <div className="h-24 bg-white/20" />
        <div className="-mt-7 px-5 pb-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-neutral-900 ring-4 ring-white/30"><Utensils className="h-6 w-6" /></span>
          <p className="mt-2 text-title font-semibold">Casa Verde Kitchen</p>
          <p className="flex items-center gap-1 text-meta text-white/80"><Star className="h-3.5 w-3.5 fill-white" /> 4.9 · Delivers to West End</p>
          <div className="mt-3 space-y-2">
            <GlassRow icon={Utensils} title="Lunch & dinner" meta="5 days a week" value="$120" />
            <GlassRow icon={Utensils} title="Breakfast club" meta="Weekly" value="$45" />
          </div>
        </div>
      </Glass>
    ),
  },
  {
    key: "checkout",
    title: "checkout",
    lead: "Customers pay before you lift a finger. No invoices to chase, no cash to count.",
    points: ["Lightning, Bitcoin and PayPal", "Subscriptions, one-off sales and bookings", "Paid up front, every time", "Receipts and reminders sent for you"],
    mock: () => (
      <Glass className="w-full max-w-[340px] p-5">
        <p className="text-meta text-white/80">Lunch & dinner · 4 weeks</p>
        <p className="mt-1 font-semibold tabular-nums" style={{ fontSize: "2.5rem", letterSpacing: "-0.03em" }}>$480.00</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {([[Zap, "Lightning"], [Bitcoin, "Bitcoin"], [CreditCard, "PayPal"]] as const).map(([Icon, l], i) => (
            <span key={l} className={cn("flex flex-col items-center gap-1 rounded-radius-md py-3 text-meta", i === 0 ? "bg-white text-neutral-900" : "bg-white/10 ring-1 ring-white/20")}>
              <Icon className="h-5 w-5" />{l}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 rounded-full bg-white/15 py-3 text-body font-semibold">
          <Check className="h-4 w-4" /> Paid
        </div>
      </Glass>
    ),
  },
  {
    key: "schedule",
    title: "schedule",
    lead: "Every visit, delivery and booking lands in one day view — and in your own Google Calendar.",
    points: ["A calendar made for your business", "Booking hours and slot length you set", "A 7am digest of tomorrow", "Addresses and notes, only for your team"],
    mock: () => (
      <Glass className="w-full max-w-[340px] p-5">
        <p className="text-title font-semibold">Tomorrow</p>
        <div className="mt-3 space-y-2">
          <GlassRow icon={Utensils} title="07:30 · Breakfast" meta="12 deliveries" />
          <GlassRow icon={Sparkles} title="10:00 · Deep clean" meta="Sandy Bay" />
          <GlassRow icon={CalendarDays} title="15:00 · Court 1" meta="4 people" />
        </div>
      </Glass>
    ),
  },
  {
    key: "payouts",
    title: "payouts",
    lead: "What you've earned is yours. Withdraw whenever you like — no waiting for the end of the month.",
    points: ["See exactly what you earned and what's available", "Withdraw to a Lightning or Bitcoin address", "Sent in seconds", "Every payout on record"],
    mock: () => (
      <Glass className="w-full max-w-[340px] p-5">
        <p className="text-meta text-white/80">Available</p>
        <p className="mt-1 font-semibold tabular-nums" style={{ fontSize: "2.5rem", letterSpacing: "-0.03em" }}>$1,284.50</p>
        <div className="mt-4 rounded-radius-md bg-white px-4 py-3 text-neutral-900">
          <p className="text-meta text-neutral-500">To</p>
          <p className="truncate text-body font-semibold">you@blink.sv</p>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-radius-md bg-white/10 px-4 py-3 ring-1 ring-white/20">
          <span className="flex items-center gap-2 text-body font-semibold"><Check className="h-4 w-4" /> Sent</span>
          <span className="text-meta text-white/80">3 seconds</span>
        </div>
      </Glass>
    ),
  },
  {
    key: "team",
    title: "team",
    lead: "Bring your people in. They run the day; only you move the money.",
    points: ["Invite managers by email", "They see the schedule, customers and numbers", "Only the owner withdraws", "Remove anyone in one tap"],
    mock: () => (
      <Glass className="w-full max-w-[340px] p-5">
        <p className="text-title font-semibold">Team</p>
        <div className="mt-3 space-y-2">
          <GlassRow icon={Users} title="You" meta="Owner" />
          <GlassRow icon={Users} title="Maria" meta="Manager" />
          <GlassRow icon={Users} title="Daniel" meta="Manager" />
        </div>
        <div className="mt-3 rounded-full bg-white py-3 text-center text-body font-semibold text-neutral-900">Invite by email</div>
      </Glass>
    ),
  },
];

const TOOLS: Array<{ title: string; text: string; pos: string; mock: ReactNode }> = [
  {
    title: "new-order alerts", text: "Email and in-app, the moment someone buys.", pos: "20% 30%",
    mock: (
      <Glass className="w-[86%] p-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-white text-neutral-900"><Bell className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block text-body font-semibold">New order · $120</span><span className="block text-meta text-white/80">Lunch & dinner, 4 weeks</span></span>
        </div>
      </Glass>
    ),
  },
  {
    title: "promo codes", text: "Discounts on your own offers, on your terms.", pos: "70% 40%",
    mock: (
      <Glass className="flex w-[86%] items-center justify-between p-4">
        <span><span className="block font-mono text-title font-semibold">ISLAND10</span><span className="block text-meta text-white/80">10% off · 50 uses</span></span>
        <TicketPercent className="h-7 w-7" />
      </Glass>
    ),
  },
  {
    title: "message subscribers", text: "One note to everyone on an active plan.", pos: "40% 70%",
    mock: (
      <Glass className="w-[86%] p-4">
        <p className="text-meta text-white/80">To 38 subscribers</p>
        <p className="mt-1 text-body font-semibold">Closed Friday for the holiday — Saturday's delivery comes with dessert 🍰</p>
      </Glass>
    ),
  },
  {
    title: "get featured", text: "Pay per order a placement brings — or book a featured week.", pos: "60% 20%",
    mock: (
      <Glass className="w-[86%] p-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-meta font-semibold">Ad</span>
          <span className="truncate text-body font-semibold">Featured on the home screen</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["1.2k", "views"], ["84", "taps"], ["9", "orders"]].map(([v, l]) => (
            <span key={l} className="rounded-radius-sm bg-white/10 py-2"><span className="block text-title font-semibold">{v}</span><span className="block text-meta text-white/80">{l}</span></span>
          ))}
        </div>
      </Glass>
    ),
  },
  {
    title: "reviews, answered", text: "Reply in public, right under the review.", pos: "30% 50%",
    mock: (
      <Glass className="w-[86%] p-4">
        <p className="flex gap-0.5">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-white" />)}</p>
        <p className="mt-1 text-body font-semibold">"Best ceviche on the island."</p>
        <p className="mt-2 rounded-radius-sm bg-white/10 px-3 py-2 text-meta">Owner: Thank you, see you Friday!</p>
      </Glass>
    ),
  },
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ForBusiness() {
  const { data: pct = 10 } = useDefaultCommission();
  const { archetypes } = useServiceArchetypes(true);
  const list = faqs(pct);

  useSeo({
    title: "Sell subscriptions and bookings in Roatán",
    description: `Put your business on EverySub: your own page, subscriptions and bookings, payment up front by Lightning, Bitcoin or PayPal, and withdrawals whenever you want. No monthly fee — ${pct}% per sale, 0% on customers you bring.`,
    path: PATH,
    image: `https://everysub.net${IMG}/hero.jpg`,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage", name: "EverySub for business", url: `https://everysub.net${PATH}`,
          about: { "@type": "Service", name: "EverySub marketplace for local businesses", areaServed: "Roatán, Honduras" },
        },
        { "@type": "FAQPage", mainEntity: list.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      ],
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />

      <main>
        {/* ─── Hero ──────────────────────────────────────────────── */}
        <section className="app-container pb-6 pt-10 text-center md:pb-10 md:pt-20">
          <TwoTone as="h1" style={H1} accent="subscriptions & bookings," plain="sold for you, paid up front" center />
          <p className="mx-auto mt-5 max-w-[640px] text-body text-muted-foreground md:text-lg">
            EverySub gives a Roatán business its own page, a checkout that takes Lightning, Bitcoin and PayPal, a schedule that fills itself — and its money whenever it wants it.
          </p>
        </section>

        <section className="px-2 md:px-4">
          <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-radius-xl bg-[#3A1F05]">
            <img src={`${IMG}/hero.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
            <div className="absolute inset-0 bg-black/15" />
            <div className="relative grid gap-8 p-6 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:p-12">
              <div className="flex flex-col justify-start gap-6 text-white">
                <p className="font-semibold" style={H3}>from a weekly meal plan to a three-day jeep.</p>
                <div><ArrowCta>Apply now</ArrowCta></div>
              </div>
              <div className="flex justify-center"><BalanceMock /></div>
              <div className="flex items-end text-white">
                <p className="rounded-radius-md bg-black/30 p-4 text-body backdrop-blur-md md:text-lg">
                  Food, cleaning, memberships, courts, tours and rentals already sell on EverySub. Bring yours — we set it up with you.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Rails ─────────────────────────────────────────────── */}
        <section className="app-container py-10 md:py-14">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <p className="shrink-0 text-body text-muted-foreground md:w-56">payments and tools your customers already trust</p>
            <div className="flex flex-1 flex-wrap items-center gap-x-10 gap-y-4 text-foreground/70">
              {([[Zap, "Lightning"], [Bitcoin, "Bitcoin"], [CreditCard, "PayPal"], [CalendarDays, "Google Calendar"], [MessageCircle, "WhatsApp"]] as const).map(([Icon, l]) => (
                <span key={l} className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Icon className="h-6 w-6" />{l}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Everything a business needs ───────────────────────── */}
        <FeatureSwitcher />

        {/* ─── Pricing ───────────────────────────────────────────── */}
        <section id="pricing" className="app-container scroll-mt-20 py-16 md:py-24">
          <TwoTone accent="no surprises" plain="simple pricing," accentFirst={false} center />
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {[
              { icon: BadgePercent, big: `${pct}%`, title: "per sale", text: "of each sale on EverySub. You keep the rest. No sale, no fee." },
              { icon: QrCode, big: "0%", title: "on your own customers", text: "Bring them with your QR code or link and the sale is all yours." },
              { icon: Zap, big: "$0", title: "to join", text: "No setup fee and no monthly fee. Promotion is optional." },
            ].map(({ icon: Icon, big, title, text }) => (
              <div key={title} className="rounded-radius-xl bg-card p-6 md:p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-radius-md bg-primary/15 text-[hsl(var(--brand-accent-active))] dark:text-primary"><Icon className="h-6 w-6" /></span>
                <p className="mt-8 font-semibold tabular-nums" style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", letterSpacing: "-0.04em", lineHeight: 1 }}>{big}</p>
                <p className="mt-2 text-title font-semibold">{title}</p>
                <p className="mt-1 text-body text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-center"><ArrowCta tone="dark">Apply — about 5 minutes</ArrowCta></div>
        </section>

        {/* ─── People ────────────────────────────────────────────── */}
        <section className="px-2 md:px-4">
          <div className="relative mx-auto grid max-w-[1400px] gap-8 overflow-hidden rounded-radius-xl bg-card p-6 md:grid-cols-2 md:p-14">
            <div className="relative z-10">
              <TwoTone accent="people who pick up" plain="software that runs itself," accentFirst={false} />
            </div>
            <img src={`${IMG}/spiral.jpg`} alt="" className="pointer-events-none absolute -bottom-10 -left-10 hidden w-[52%] max-w-[560px] mix-blend-multiply md:block dark:hidden" loading="lazy" />
            {/* The spiral is drawn on white; on the dark theme the same corner gets the amber glass instead. */}
            <img src={`${IMG}/panel.jpg`} alt="" className="pointer-events-none absolute bottom-6 left-6 hidden h-[44%] w-[44%] rounded-radius-lg object-cover dark:md:block" loading="lazy" />
            <div className="relative z-10 space-y-3 md:row-span-2">
              {[
                { icon: Sparkles, title: "we set you up", text: "Your page, plans and schedule — we build them with you, so you go live looking right." },
                { icon: Headphones, title: "someone answers", text: `A real person on WhatsApp (${LEGAL_CONTACT.whatsapp}), for you and for your customers.` },
                { icon: Wallet, title: "your money, your call", text: "Everything you earn is shown as it lands. Withdraw when you choose — nobody approves it." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-5 rounded-radius-lg bg-background/70 p-5 md:p-6">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-radius-md bg-primary/15 text-[hsl(var(--brand-accent-active))] dark:text-primary"><Icon className="h-6 w-6" /></span>
                  <span>
                    <span className="block font-semibold" style={{ fontSize: "1.375rem", letterSpacing: "-0.02em" }}>{title}</span>
                    <span className="mt-1 block text-body text-muted-foreground">{text}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="hidden min-h-[220px] md:block" />
          </div>
        </section>

        {/* ─── Tools carousel ────────────────────────────────────── */}
        <ToolsCarousel />

        {/* ─── Who's on it ───────────────────────────────────────── */}
        {archetypes.length > 0 && (
          <section className="app-container pb-6">
            <p className="text-body text-muted-foreground">selling on EverySub today</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {archetypes.map(({ key, label, Icon }) => (
                <Link key={key} to={serviceListingHref(key)} className="flex h-11 items-center gap-2 rounded-full bg-card px-5 text-body font-semibold hover:bg-muted">
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ))}
              <Link to={APPLY} className="flex h-11 items-center rounded-full bg-card px-5 text-body font-semibold text-muted-foreground hover:bg-muted">Something else?</Link>
            </div>
          </section>
        )}

        {/* ─── FAQ ───────────────────────────────────────────────── */}
        <section id="faq" className="app-container scroll-mt-20 py-16 md:py-24">
          <div className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
            <TwoTone accent="answered" plain="questions," accentFirst={false} />
            <div className="divide-y divide-border">
              {list.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden" style={{ fontSize: "1.25rem", letterSpacing: "-0.02em" }}>
                    {f.q}
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-body text-muted-foreground md:text-lg">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Final CTA ─────────────────────────────────────────── */}
        <section className="px-2 pb-16 md:px-4">
          <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-radius-xl bg-[#2E1803]">
            <img src={`${IMG}/cta.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover object-left" loading="lazy" />
            <div className="absolute inset-0 bg-black/20 md:bg-transparent" />
            <div className="relative grid min-h-[420px] md:grid-cols-2">
              <div className="hidden md:block" />
              <div className="flex flex-col justify-center gap-5 p-6 text-white md:p-14">
                <h2 className="font-semibold" style={H2}>ready to sell on EverySub?</h2>
                <p className="max-w-[460px] text-body text-white/85 md:text-lg">Apply in about five minutes, or ask us anything first. We'll get you live.</p>
                <div className="flex flex-wrap gap-3">
                  <ArrowCta>Apply now</ArrowCta>
                  <ArrowCta tone="glass" href={LEGAL_CONTACT.whatsappHref}><MessageCircle className="h-4 w-4" /> Talk to us</ArrowCta>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg">
      <div className="app-container flex h-16 items-center gap-6">
        <Link to="/" className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold tracking-tight">EverySub</span>
          <span className="text-body text-muted-foreground">for business</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-6 text-body text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#faq" className="hover:text-foreground">Questions</a>
        </nav>
        <Link to={APPLY} className="ml-auto inline-flex h-10 items-center rounded-full bg-foreground px-5 text-body font-semibold text-background md:ml-0">
          Apply
        </Link>
      </div>
    </header>
  );
}

/** Pick a capability on the right; the glass panel on the left shows it. */
function FeatureSwitcher() {
  const [active, setActive] = useState(0);
  const touched = useRef(false);

  // Walks through the list on its own until the visitor picks one —
  // never for someone who asked the OS for less motion.
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => { if (!touched.current) setActive((i) => (i + 1) % FEATURES.length); }, 6000);
    return () => window.clearInterval(t);
  }, []);

  const f = FEATURES[active];
  return (
    <section id="features" className="app-container scroll-mt-20 py-10 md:py-16">
      <TwoTone accent="for a local business" plain="everything you need," accentFirst={false} />
      <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-14">
        <div className="relative aspect-square overflow-hidden rounded-radius-xl bg-[#4A2606]">
          <img src={`${IMG}/panel.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <div key={f.key} className="relative flex h-full items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
            {f.mock()}
          </div>
        </div>
        <div className="flex flex-col justify-center">
          {FEATURES.map((x, i) => {
            const open = i === active;
            return (
              <div key={x.key} className="border-b border-border/70 py-4 last:border-0">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => { touched.current = true; setActive(i); }}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span className={cn("font-semibold transition-colors", open ? "text-foreground" : "text-muted-foreground hover:text-foreground")} style={H3}>
                    {x.title}
                  </span>
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", open ? "bg-primary" : "bg-muted-foreground/40")} />
                </button>
                {open && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-300">
                    <p className="mt-3 text-body text-muted-foreground md:text-lg">{x.lead}</p>
                    <ul className="mt-4 space-y-2">
                      {x.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-body">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>
                          {p}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <ArrowCta tone="dark">Apply</ArrowCta>
                      <a href="#pricing" className="inline-flex h-12 items-center rounded-full px-5 text-body font-semibold ring-1 ring-border hover:bg-muted">See pricing</a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Swipe on a phone; arrows on a laptop. */
function ToolsCarousel() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.min(ref.current.clientWidth * 0.8, 440), behavior: "smooth" });
  return (
    <section className="py-16 md:py-24">
      <div className="app-container flex items-end justify-between gap-6">
        <TwoTone accent="tools to grow" plain="built in, not bolted on" />
        <div className="hidden shrink-0 gap-2 md:flex">
          <button type="button" aria-label="Previous" onClick={() => scroll(-1)} className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90"><ArrowLeft className="h-5 w-5" /></button>
          <button type="button" aria-label="Next" onClick={() => scroll(1)} className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90"><ArrowRight className="h-5 w-5" /></button>
        </div>
      </div>
      <div
        ref={ref}
        className="mt-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[max(16px,calc((100vw_-_1280px)/2_+_24px))] scroll-px-[max(16px,calc((100vw_-_1280px)/2_+_24px))] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TOOLS.map((t) => (
          <article key={t.title} className="w-[82vw] max-w-[400px] shrink-0 snap-start rounded-radius-xl bg-card p-2 md:w-[400px]">
            <div className="relative aspect-[4/3.6] overflow-hidden rounded-radius-lg bg-[#4A2606]">
              <img src={`${IMG}/panel.jpg`} alt="" className="absolute inset-0 h-full w-full scale-150 object-cover" style={{ objectPosition: t.pos }} loading="lazy" />
              <div className="relative flex h-full items-center justify-center">{t.mock}</div>
            </div>
            <div className="px-4 pb-5 pt-5 text-center">
              <h3 className="font-semibold" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>{t.title}</h3>
              <p className="mt-1 text-body text-muted-foreground">{t.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
