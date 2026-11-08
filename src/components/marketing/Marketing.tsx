import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { cn } from "@/lib/utils";

/**
 * The marketing-page kit — the /for-business look, shared.
 *
 * Every landing (for-business, how-it-works, pay-with-bitcoin, about…) is built
 * from these so they cannot drift apart: two-tone headlines, rendered amber
 * glass backgrounds (images in /public, never CSS gradients), and the product's
 * own screens drawn in HTML on frosted glass. App screens keep DESIGN.md; this
 * is for pages whose job is to persuade.
 */

/** Display sizes, fluid between phone and desktop. */
export const H1: CSSProperties = { fontSize: "clamp(2.4rem, 6.4vw, 5.6rem)", lineHeight: 1.02, letterSpacing: "-0.035em" };
export const H2: CSSProperties = { fontSize: "clamp(2rem, 4.6vw, 4rem)", lineHeight: 1.04, letterSpacing: "-0.03em" };
export const H3: CSSProperties = { fontSize: "clamp(1.5rem, 2.6vw, 2.25rem)", lineHeight: 1.1, letterSpacing: "-0.02em" };

/** The accent line of a headline: deep amber on light (readable), brand amber on dark. */
export const ACCENT = "text-[hsl(var(--brand-accent-active))] dark:text-primary";
/** An icon tile on a light card. */
export const ICON_TILE = "flex h-12 w-12 shrink-0 items-center justify-center rounded-radius-md bg-primary/15 text-[hsl(var(--brand-accent-active))] dark:text-primary";

/** The call to action: a pill with the arrow in its own amber disc. */
export function ArrowCta({ to, href, children, tone = "light", className }: {
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
  return <Link to={to ?? "/"} className={cls}>{inner}</Link>;
}

/** Frosted glass over the rendered backgrounds. */
export function Glass({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-radius-xl bg-white/15 text-white ring-1 ring-white/35 backdrop-blur-xl", className)}>
      {children}
    </div>
  );
}

export function GlassRow({ icon: Icon, title, meta, value }: { icon: LucideIcon; title: string; meta?: string; value?: string }) {
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

/** A heading in two tones: the accent line, then the plain one (or the reverse). */
export function TwoTone({ accent, plain, accentFirst = true, center, as: Tag = "h2", style = H2 }: {
  accent: string; plain: string; accentFirst?: boolean; center?: boolean; as?: "h1" | "h2"; style?: CSSProperties;
}) {
  return (
    <Tag className={cn("font-semibold text-foreground", center && "text-center")} style={style}>
      {accentFirst ? (<><span className={cn("block", ACCENT)}>{accent}</span><span className="block">{plain}</span></>)
        : (<><span className="block">{plain}</span><span className={cn("block", ACCENT)}>{accent}</span></>)}
    </Tag>
  );
}

/** A full-width panel on one of the amber renders. */
export function RenderPanel({ image, className, children, tint = "bg-black/15" }: {
  image: string; className?: string; children: ReactNode; tint?: string;
}) {
  return (
    <section className="px-2 md:px-4">
      <div className={cn("relative mx-auto max-w-[1400px] overflow-hidden rounded-radius-xl bg-[#3A1F05]", className)}>
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className={cn("absolute inset-0", tint)} />
        <div className="relative">{children}</div>
      </div>
    </section>
  );
}

/** A card of the light sections: icon tile, title, text. */
export function FeatureCard({ icon: Icon, title, children, className }: {
  icon: LucideIcon; title: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("rounded-radius-xl bg-card p-6 md:p-8", className)}>
      <span className={ICON_TILE}><Icon className="h-6 w-6" /></span>
      <h3 className="mt-6 font-semibold" style={{ fontSize: "1.375rem", letterSpacing: "-0.02em" }}>{title}</h3>
      <div className="mt-1 text-body text-muted-foreground">{children}</div>
    </div>
  );
}

/** Questions in two columns: the heading left, `<details>` right. */
export function Faq({ items, id = "faq" }: { items: Array<{ q: string; a: string }>; id?: string }) {
  return (
    <section id={id} className="app-container scroll-mt-20 py-16 md:py-24">
      <div className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
        <TwoTone accent="answered" plain="questions," accentFirst={false} />
        <div className="divide-y divide-border">
          {items.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden" style={{ fontSize: "1.25rem", letterSpacing: "-0.02em" }}>
                {f.q}
                <span aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-body text-muted-foreground md:text-lg">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** FAQPage JSON-LD for the same items. */
export const faqLd = (items: Array<{ q: string; a: string }>) => ({
  "@type": "FAQPage",
  mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

/** The marketing frame: its own sticky top bar, the page, the site footer. */
export function MarketingPage({ label, links = [], cta, children }: {
  /** Next to the logo — "for business", "how it works"… */
  label?: string;
  links?: Array<{ href: string; label: string }>;
  cta: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg">
        <div className="app-container flex h-16 items-center gap-6">
          <Link to="/discovery" className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight">EverySub</span>
            {label && <span className="text-body text-muted-foreground">{label}</span>}
          </Link>
          {links.length > 0 && (
            <nav className="ml-auto hidden items-center gap-6 text-body text-muted-foreground md:flex">
              {links.map((l) => (
                l.href.startsWith("#")
                  ? <a key={l.href} href={l.href} className="hover:text-foreground">{l.label}</a>
                  : <Link key={l.href} to={l.href} className="hover:text-foreground">{l.label}</Link>
              ))}
            </nav>
          )}
          <Link to={cta.to} className={cn("inline-flex h-10 items-center rounded-full bg-foreground px-5 text-body font-semibold text-background", links.length ? "ml-auto md:ml-0" : "ml-auto")}>
            {cta.label}
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
