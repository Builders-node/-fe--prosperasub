import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bitcoin, CarFront, Check, CreditCard, QrCode, Store, Wallet, Zap } from "lucide-react";

import {
  ArrowCta, FeatureCard, Faq, Glass, H1, H3, ICON_TILE, MarketingPage, RenderPanel, TwoTone, faqLd,
} from "@/components/marketing/Marketing";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useSeo } from "@/hooks/useSeo";
import { supabaseDb } from "@/integrations/supabase/client";
import { providerHref } from "@/lib/services/serviceUrls";
import { carProviderPath } from "@/features/vehicles";

/**
 * /pay-with-bitcoin — how paying works, and the directory of Roatán
 * businesses that take Bitcoin (every business on EverySub does: the checkout
 * is the platform's). Fees are read from payment_method_settings, so the page
 * says what checkout will actually charge.
 */

const IMG = "/for-business";
const PATH = "/pay-with-bitcoin";

interface Biz { id: string; name: string; avatar_url: string | null; archetype_key: string | null; unit: string | null; location: string | null }

function useBusinesses() {
  return useQuery({
    queryKey: ["bitcoin-directory"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabaseDb.from("providers")
        .select("id,name,avatar_url,archetype_key,unit,location")
        .eq("status", "active").order("name");
      return (data ?? []) as Biz[];
    },
  });
}

const pct = (n: number) => (n > 0 ? `+${n % 1 ? n.toFixed(1) : n}%` : "no fee");

export default function PayWithBitcoin() {
  const { surchargePercent } = usePaymentMethods();
  const { data: businesses = [] } = useBusinesses();
  const { archetypes } = useServiceArchetypes(true);
  const labelOf = (b: Biz) => b.unit === "vehicles" ? "Car rental" : archetypes.find((a) => a.key === b.archetype_key)?.label ?? "Services";
  const hrefOf = (b: Biz) => b.unit === "vehicles" ? carProviderPath(b.id) : b.archetype_key ? providerHref(b.archetype_key, b.id) : "/discovery";

  const ln = surchargePercent("lightning");
  const oc = surchargePercent("onchain");
  const pp = surchargePercent("paypal");

  const FAQ = [
    { q: "Which wallet do I need?", a: "Any Lightning wallet — Blink, Wallet of Satoshi, Phoenix, Strike, Muun and others all work. For on-chain Bitcoin, any Bitcoin wallet." },
    { q: "Is there a fee?", a: `Lightning has ${ln ? `a ${ln}% fee` : "no fee"}. On-chain Bitcoin ${oc ? `adds ${oc}%` : "has no fee"} and PayPal or card ${pp ? `adds ${pp}%` : "has no fee"} — they cover the network and the processor. You see the total before you pay.` },
    { q: "How fast is it?", a: "Lightning confirms in seconds and your order goes through on the spot. On-chain Bitcoin waits for the network to confirm, usually minutes." },
    { q: "Which businesses take Bitcoin?", a: "Every business on EverySub — the checkout is ours, so a café, a cleaner or a car rental company takes Lightning without setting anything up." },
    { q: "Can I still pay by card?", a: "Yes. Card and PayPal are at checkout next to Lightning and Bitcoin." },
  ];

  useSeo({
    title: "Pay with Bitcoin in Roatán — Lightning, on-chain, card",
    description: `Pay Roatán businesses with Bitcoin: Lightning in seconds with ${ln ? `${ln}%` : "no"} fee, on-chain Bitcoin, or card and PayPal. Meals, cleaning, memberships and car rental on EverySub.`,
    path: PATH,
    image: `https://everysub.net${IMG}/hero.jpg`,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        faqLd(FAQ),
        {
          "@type": "ItemList", name: "Businesses in Roatán that accept Bitcoin",
          itemListElement: businesses.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `https://everysub.net${hrefOf(b)}` })),
        },
      ],
    },
  });

  return (
    <MarketingPage
      label="pay with bitcoin"
      links={[{ href: "#methods", label: "Ways to pay" }, { href: "#businesses", label: "Businesses" }, { href: "#faq", label: "Questions" }]}
      cta={{ to: "/discovery", label: "Browse" }}
    >
      {/* ─── Hero ─── */}
      <section className="app-container pb-6 pt-10 text-center md:pb-10 md:pt-20">
        <TwoTone as="h1" style={H1} accent="pay with bitcoin," plain="all over Roatán" center />
        <p className="mx-auto mt-5 max-w-[640px] text-body text-muted-foreground md:text-lg">
          Lightning in seconds, on-chain Bitcoin, or card if you'd rather — for meals, cleaning, memberships and car rental from local businesses.
        </p>
      </section>

      <RenderPanel image={`${IMG}/hero.jpg`}>
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto_1fr] md:p-12">
          <div className="flex flex-col justify-start gap-6 text-white">
            <p className="font-semibold" style={H3}>scan, pay, done — in about three seconds.</p>
            <div><ArrowCta to="/discovery">Find something to buy</ArrowCta></div>
          </div>
          <div className="flex justify-center">
            <Glass className="w-full max-w-[360px] p-5 text-center">
              <p className="text-meta text-white/80">Lightning invoice</p>
              <p className="mt-1 font-semibold tabular-nums" style={{ fontSize: "2.5rem", letterSpacing: "-0.03em" }}>$45.00</p>
              <div className="mx-auto mt-4 flex h-44 w-44 items-center justify-center rounded-radius-lg bg-white text-neutral-900">
                <QrCode className="h-28 w-28" strokeWidth={1.25} />
              </div>
              <p className="mt-4 text-body">Scan with any Lightning wallet</p>
              <div className="mt-4 flex items-center justify-center gap-2 rounded-full bg-white/15 py-3 text-body font-semibold">
                <Check className="h-4 w-4" /> Paid · Meal plan confirmed
              </div>
            </Glass>
          </div>
          <div className="flex items-end text-white">
            <p className="rounded-radius-md bg-black/30 p-4 text-body backdrop-blur-md md:text-lg">
              The checkout is EverySub's, so every business here takes Bitcoin — without a terminal, a wallet or a setup of its own.
            </p>
          </div>
        </div>
      </RenderPanel>

      {/* ─── Methods, with the real fees ─── */}
      <section id="methods" className="app-container scroll-mt-20 py-16 md:py-24">
        <TwoTone accent="pick yours" plain="three ways to pay," accentFirst={false} />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <MethodCard icon={Zap} title="Lightning" fee={pct(ln)} lines={["Confirms in seconds", "Any Lightning wallet", "Best for everyday plans"]} />
          <MethodCard icon={Bitcoin} title="Bitcoin on-chain" fee={pct(oc)} lines={["Any Bitcoin wallet", "Confirms in minutes", "Good for bigger amounts"]} />
          <MethodCard icon={CreditCard} title="Card or PayPal" fee={pct(pp)} lines={["Visa, Mastercard via PayPal", "Or your PayPal balance", "Auto-renew available"]} />
        </div>
      </section>

      {/* ─── How to pay with Lightning ─── */}
      <section className="app-container pb-16 md:pb-24">
        <TwoTone accent="with lightning" plain="how to pay" accentFirst={false} />
        <div className="mt-10 grid gap-3 md:grid-cols-4">
          {[
            { icon: Store, title: "choose a plan", text: "Any service, any business on EverySub." },
            { icon: Zap, title: "pick Lightning", text: "At checkout, next to card and PayPal." },
            { icon: QrCode, title: "scan the QR", text: "Open your wallet and scan — or tap to open it on the same phone." },
            { icon: Check, title: "you're in", text: "Payment confirms itself in seconds. Nothing to upload, nothing to wait for." },
          ].map((s) => <FeatureCard key={s.title} icon={s.icon} title={s.title}>{s.text}</FeatureCard>)}
        </div>
      </section>

      {/* ─── Directory ─── */}
      {businesses.length > 0 && (
        <section id="businesses" className="app-container scroll-mt-20 pb-16 md:pb-24">
          <TwoTone accent="in Roatán" plain="businesses that take bitcoin" accentFirst={false} />
          <p className="mt-3 max-w-[640px] text-body text-muted-foreground md:text-lg">Every one of them takes Lightning, on-chain Bitcoin, card and PayPal through EverySub.</p>
          <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b) => (
              <Link key={b.id} to={hrefOf(b)} className="flex items-center gap-3 rounded-radius-lg bg-card p-4 transition-colors hover:bg-muted/40">
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                  <Photo src={b.avatar_url} label={initialsOf(b.name)} icon={b.unit === "vehicles" ? CarFront : Store} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title font-semibold">{b.name}</span>
                  <span className="block truncate text-meta text-muted-foreground">{labelOf(b)}{b.location ? ` · ${b.location}` : ""}</span>
                </span>
                <Zap className="h-4 w-4 shrink-0 text-[hsl(var(--brand-accent-active))] dark:text-primary" aria-label="Accepts Lightning" />
              </Link>
            ))}
          </div>
          <p className="mt-6 text-body text-muted-foreground">
            Run a business on Roatán? <Link to="/for-business" className="font-semibold text-foreground underline-offset-4 hover:underline">Take Bitcoin with EverySub</Link> — no terminal needed.
          </p>
        </section>
      )}

      <Faq items={FAQ} />

      <section className="px-2 pb-16 md:px-4">
        <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-radius-xl bg-[#2E1803]">
          <img src={`${IMG}/cta.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover object-left" loading="lazy" />
          <div className="absolute inset-0 bg-black/20 md:bg-transparent" />
          <div className="relative grid min-h-[360px] md:grid-cols-2">
            <div className="hidden md:block" />
            <div className="flex flex-col justify-center gap-5 p-6 text-white md:p-14">
              <h2 className="font-semibold" style={{ fontSize: "clamp(2rem, 4.6vw, 4rem)", lineHeight: 1.04, letterSpacing: "-0.03em" }}>spend your sats on the island.</h2>
              <div className="flex flex-wrap gap-3">
                <ArrowCta to="/discovery">Browse services</ArrowCta>
                <ArrowCta tone="glass" to="/how-it-works"><Wallet className="h-4 w-4" /> How it works</ArrowCta>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}

function MethodCard({ icon: Icon, title, fee, lines }: { icon: typeof Zap; title: string; fee: string; lines: string[] }) {
  return (
    <div className="rounded-radius-xl bg-card p-6 md:p-8">
      <div className="flex items-center justify-between">
        <span className={ICON_TILE}><Icon className="h-6 w-6" /></span>
        <span className="rounded-full bg-muted px-3 py-1 text-meta font-semibold text-foreground">{fee}</span>
      </div>
      <h3 className="mt-6 font-semibold" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>{title}</h3>
      <ul className="mt-3 space-y-1.5">
        {lines.map((l) => (
          <li key={l} className="flex items-center gap-2 text-body text-muted-foreground"><Check className="h-4 w-4 shrink-0 text-foreground" /> {l}</li>
        ))}
      </ul>
    </div>
  );
}
