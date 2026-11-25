import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Car, Check, ChevronRight, Clock, LayoutList, Link as LinkIcon, MessageCircle, Tag } from "lucide-react";
import {
  ArrowCta, Faq, Glass, GlassRow, H3, MarketingPage, RenderPanel, TwoTone, faqLd,
} from "@/components/marketing/Marketing";
import { Skeleton } from "@/components/patterns/Skeleton";
import { PlanTile, useHomePlans } from "@/components/discovery/homePlans";
import { GUIDES, GUIDES_INDEX, guideBySlug, guideExtras, type Guide } from "@/lib/seo/guides";
import { serviceSeo } from "@/lib/seo/serviceSeo";
import { inSpanishUrl } from "@/lib/seo/lang";
import { useSeo } from "@/hooks/useSeo";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

/**
 * `/guides` and `/guides/:slug` — practical answers to what people search
 * before they buy a service on Roatán, laid out like the other landings
 * (components/marketing): a two-tone hero, the guide on the amber render, its
 * sections, the plans it is about, and a call to action.
 *
 * The words live in lib/seo/guides.ts, which the robot pages (middleware.ts)
 * read too, so a person and a crawler see the same text. Both languages: the
 * app runs under /es for Spanish, and every link here stays inside it.
 */
const SITE = "https://everysub.net";
const IMG = "/for-business";

type Lang = "en" | "es";
const useLang = (): Lang => (inSpanishUrl() ? "es" : "en");

/** The words of the page around the guide. */
const UI = {
  en: {
    label: "guides", browse: "Browse", read: "Read the guide", seePlans: "See the plans", inGuide: "In this guide",
    plansNow: (n: number) => `${n} ${n === 1 ? "plan" : "plans"} on sale now`, from: "from", minutes: (n: number) => `${n} min read`,
    plansAccent: "plans", plansPlain: "you can sign up for today", moreAccent: "more guides", morePlain: "to life on the island",
    ctaTitle: "find something for your week.", ctaBullets: ["Paid up front, no surprises", "Lightning, Bitcoin, card or PayPal", "Cancel from your account"],
    open: "Open", allAccent: "guides", allPlain: "to life on Roatán", allNote: "Short and practical — each one ends in plans you can sign up for.",
    panel: "what people ask before they move to, or stay a while on, Roatán.", updated: "Updated",
    inShort: "In short", by: "By the EverySub team", faqAccent: "answered", faqPlain: "questions,", faqNav: "Questions", inlineCta: "Live prices from businesses on the island", copy: "Copy link", copied: "Link copied", home: "Home", guides: "Guides",
  },
  es: {
    label: "guías", browse: "Explorar", read: "Leer la guía", seePlans: "Ver los planes", inGuide: "En esta guía",
    plansNow: (n: number) => `${n} ${n === 1 ? "plan" : "planes"} a la venta`, from: "desde", minutes: (n: number) => `${n} min de lectura`,
    plansAccent: "planes", plansPlain: "que puedes contratar hoy", moreAccent: "más guías", morePlain: "para vivir en la isla",
    ctaTitle: "encuentra algo para tu semana.", ctaBullets: ["Pago por adelantado, sin sorpresas", "Lightning, Bitcoin, tarjeta o PayPal", "Cancela desde tu cuenta"],
    open: "Abrir", allAccent: "guías", allPlain: "para vivir en Roatán", allNote: "Cortas y prácticas — cada una termina con planes que puedes contratar.",
    panel: "lo que la gente pregunta antes de mudarse o pasar una temporada en Roatán.", updated: "Actualizado",
    inShort: "En resumen", by: "Por el equipo de EverySub", faqAccent: "respondidas", faqPlain: "preguntas,", faqNav: "Preguntas", inlineCta: "Precios actuales de negocios de la isla", copy: "Copiar enlace", copied: "Enlace copiado", home: "Inicio", guides: "Guías",
  },
};

/** "Moving to Roatán: what to set up…" → accent "Moving to Roatán", plain "what to set up…". */
function splitTitle(h1: string): { accent: string; plain: string } {
  const i = h1.indexOf(":");
  if (i > 0) return { accent: h1.slice(0, i).trim(), plain: h1.slice(i + 1).trim() };
  return { accent: h1, plain: "" };
}

const minutesOf = (g: Guide, lang: Lang) => {
  const t = g[lang];
  const words = [t.intro, ...t.sections.flatMap((s) => [s.h, ...s.p])].join(" ").split(/\s+/).length;
  return Math.max(2, Math.round(words / 200));
};

/** Where a guide's call to action goes: its first service. */
const serviceHref = (key: string) => (key === "vehicles" ? "/vehicles" : `/services/${key}`);

/** The hero headline: smaller than the landing H1, a guide's title is long. */
const GUIDE_H1 = { fontSize: "clamp(2.2rem, 5.2vw, 4.5rem)", lineHeight: 1.03, letterSpacing: "-0.035em" } as const;

function GuideCard({ g, lang, n }: { g: Guide; lang: Lang; n?: number }) {
  const ui = UI[lang];
  return (
    <Link
      to={`/guides/${g.slug}`}
      className="group flex h-full flex-col rounded-radius-xl bg-card p-6 transition-colors hover:bg-muted/70 md:p-8"
    >
      <span className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-body font-semibold text-background">
          {n ?? <BookOpen className="h-4 w-4" />}
        </span>
        <span className="text-meta text-muted-foreground">{ui.minutes(minutesOf(g, lang))}</span>
      </span>
      <h3 className="mt-6 font-semibold" style={{ fontSize: "1.375rem", lineHeight: 1.15, letterSpacing: "-0.02em" }}>{g[lang].title}</h3>
      <p className="mt-2 flex-1 text-body text-muted-foreground">{g[lang].description}</p>
      <span className="mt-6 inline-flex items-center gap-2 text-body font-semibold">
        {ui.open}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function CtaPanel({ lang, to }: { lang: Lang; to: string }) {
  const ui = UI[lang];
  return (
    <section className="px-2 pb-16 md:px-4">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-radius-xl bg-[#2E1803]">
        <img src={`${IMG}/cta.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover object-left" loading="lazy" />
        <div className="absolute inset-0 bg-black/20 md:bg-transparent" />
        <div className="relative grid min-h-[380px] md:grid-cols-2">
          <div className="hidden md:block" />
          <div className="flex flex-col justify-center gap-5 p-6 text-white md:p-14">
            <h2 className="font-semibold" style={{ fontSize: "clamp(2rem, 4.6vw, 4rem)", lineHeight: 1.04, letterSpacing: "-0.03em" }}>{ui.ctaTitle}</h2>
            <ul className="space-y-1 text-body text-white/85">
              {ui.ctaBullets.map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4" /> {t}</li>
              ))}
            </ul>
            <div><ArrowCta to={to}>{ui.browse}</ArrowCta></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function GuidesIndex() {
  const lang = useLang();
  const idx = GUIDES_INDEX[lang];
  const ui = UI[lang];
  useSeo({
    title: idx.title,
    description: idx.description,
    path: "/guides",
    image: `${SITE}${IMG}/hero.jpg`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g[lang].title, url: `${SITE}${lang === "es" ? "/es" : ""}/guides/${g.slug}` })),
    },
  });

  return (
    <MarketingPage label={ui.label} cta={{ to: "/discovery", label: ui.browse }}>
      <section className="app-container pb-6 pt-10 text-center md:pb-10 md:pt-20">
        <TwoTone as="h1" style={GUIDE_H1} accent={ui.allAccent} plain={ui.allPlain} center />
        <p className="mx-auto mt-5 max-w-[640px] text-body text-muted-foreground md:text-lg">{idx.intro}</p>
      </section>

      <RenderPanel image={`${IMG}/hero.jpg`}>
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-12">
          <p className="max-w-[520px] font-semibold text-white" style={H3}>{ui.panel}</p>
          <Glass className="w-full max-w-[420px] p-5">
            <p className="text-meta text-white/80">{idx.h1}</p>
            <div className="mt-3 space-y-2">
              {GUIDES.slice(0, 4).map((g) => (
                <Link key={g.slug} to={`/guides/${g.slug}`} className="block">
                  <GlassRow icon={BookOpen} title={splitTitle(g[lang].h1).accent} meta={ui.minutes(minutesOf(g, lang))} />
                </Link>
              ))}
            </div>
          </Glass>
        </div>
      </RenderPanel>

      <section className="app-container py-16 md:py-24">
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {GUIDES.map((g, i) => (
            <li key={g.slug}><GuideCard g={g} lang={lang} n={i + 1} /></li>
          ))}
        </ul>
        <p className="mt-6 text-center text-body text-muted-foreground">{ui.allNote}</p>
      </section>

      <CtaPanel lang={lang} to="/discovery" />
    </MarketingPage>
  );
}

export function GuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const lang = useLang();
  const idx = GUIDES_INDEX[lang];
  const ui = UI[lang];
  const g = guideBySlug(slug);
  const { data: plans = [], isLoading } = useHomePlans();
  const t = g?.[lang];
  const self = g ? `${SITE}${lang === "es" ? "/es" : ""}/guides/${g.slug}` : null;
  const ex = g ? guideExtras(g.slug, lang) : null;

  useSeo({
    title: t?.title ?? null,
    description: t?.description ?? null,
    path: g ? `/guides/${g.slug}` : null,
    type: "article",
    image: `${SITE}${IMG}/hero.jpg`,
    jsonLd: g && t ? {
      "@context": "https://schema.org",
      "@graph": [{
      "@type": "Article",
      headline: t.h1,
      description: t.description,
      inLanguage: lang,
      datePublished: g.updated,
      dateModified: g.updated,
      mainEntityOfPage: self,
      image: `${SITE}${IMG}/hero.jpg`,
      author: { "@type": "Organization", name: "EverySub", url: SITE },
      publisher: { "@type": "Organization", name: "EverySub", logo: `${SITE}/icon-512.png` },
      }, {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "EverySub", item: `${SITE}${lang === "es" ? "/es" : ""}/discovery` },
          { "@type": "ListItem", position: 2, name: ui.guides, item: `${SITE}${lang === "es" ? "/es" : ""}/guides` },
          { "@type": "ListItem", position: 3, name: t.h1, item: self },
        ],
      }, ...(ex ? [faqLd(ex.faq)] : [])],
    } : null,
  });

  // The guide's services, live: every plan on sale in them right now.
  const items = useMemo(
    () => (g ? plans.filter((p) => p.provider?.archetype_key && g.services.includes(p.provider.archetype_key)) : []),
    [g, plans],
  );
  const cheapest = useMemo(() => items.map((p) => p.price_cents ?? 0).filter((c) => c > 0).sort((a, b) => a - b)[0] ?? null, [items]);

  // Which section is being read (the contents list marks it) and how far
  // through the guide the reader is (the bar under the header).
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const read = document.getElementById("read");
      if (read) {
        const r = read.getBoundingClientRect();
        setProgress(Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight * 0.6))));
      }
      let cur = 0;
      document.querySelectorAll<HTMLElement>("[data-sec]").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.35) cur = Number(el.dataset.sec);
      });
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [g?.slug]);

  if (!g || !t) {
    return (
      <MarketingPage label={ui.label} cta={{ to: "/discovery", label: ui.browse }}>
        <section className="app-container py-24 text-center">
          <TwoTone as="h1" style={GUIDE_H1} accent={lang === "es" ? "guía no encontrada" : "guide not found"} plain="" center />
          <div className="mt-6 flex justify-center"><ArrowCta tone="dark" to="/guides">{idx.all}</ArrowCta></div>
        </section>
      </MarketingPage>
    );
  }

  const { accent, plain } = splitTitle(t.h1);
  const cars = g.services.includes("vehicles") ? serviceSeo("vehicles", lang) : null;
  const ctaTo = serviceHref(g.services[0]);

  return (
    <MarketingPage
      label={ui.label}
      links={[{ href: "#read", label: ui.read }, { href: "#plans", label: ui.seePlans }, { href: "/guides", label: idx.all }]}
      cta={{ to: ctaTo, label: ui.browse }}
    >
      <div aria-hidden className="fixed inset-x-0 top-16 z-30 h-0.5">
        <div className="h-full origin-left bg-primary transition-transform duration-150" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* ─── Hero ─── */}
      <section className="app-container pb-6 pt-10 text-center md:pb-10 md:pt-16">
        <nav aria-label={tr("Breadcrumb")} className="flex flex-wrap items-center justify-center gap-1 text-meta text-muted-foreground">
          <Link to="/discovery" className="hover:text-foreground">{ui.home}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/guides" className="hover:text-foreground">{ui.guides}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>{ui.minutes(minutesOf(g, lang))}</span>
        </nav>
        <TwoTone as="h1" style={GUIDE_H1} accent={accent} plain={plain} center />
        <p className="mx-auto mt-5 max-w-[680px] text-body text-muted-foreground md:text-lg">{t.intro}</p>
        <p className="mt-4 text-meta text-muted-foreground">{ui.by} · {ui.updated} <time dateTime={g.updated}>{g.updated}</time></p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href="#plans" className="group inline-flex h-12 items-center gap-3 rounded-full bg-foreground pl-1.5 pr-5 text-body font-semibold text-background transition-transform hover:opacity-90 active:scale-[0.98]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </span>
            {ui.seePlans}
          </a>
        </div>
      </section>

      {/* ─── The guide at a glance, on the render ─── */}
      <RenderPanel image={`${IMG}/hero.jpg`}>
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-12">
          <p className="max-w-[560px] font-semibold text-white" style={H3}>{t.description}</p>
          <Glass className="w-full max-w-[420px] p-5">
            <p className="text-meta text-white/80">{ui.inGuide}</p>
            <ol className="mt-3 space-y-2">
              {t.sections.map((s, i) => (
                <li key={s.h}>
                  <a href={`#s${i + 1}`} className="flex items-center gap-3 rounded-radius-md bg-white/10 px-3 py-2.5 ring-1 ring-white/20 transition-colors hover:bg-white/20">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-meta font-semibold text-neutral-900">{i + 1}</span>
                    <span className="min-w-0 truncate text-body font-semibold">{s.h.replace(/^\d+\.\s*/, "")}</span>
                  </a>
                </li>
              ))}
            </ol>
            <div className="mt-3 space-y-2">
              {items.length > 0 && (
                <GlassRow icon={LayoutList} title={ui.plansNow(items.length)} value={cheapest ? `${ui.from} $${Math.round(cheapest / 100)}` : undefined} />
              )}
              <GlassRow icon={Clock} title={`${ui.updated} ${g.updated}`} />
            </div>
          </Glass>
        </div>
      </RenderPanel>

      {/* ─── The guide: one readable column, a sticky contents list beside it ─── */}
      <section id="read" className="app-container scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto grid max-w-[1040px] gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <nav aria-label={ui.inGuide} className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-meta font-semibold uppercase tracking-wide text-muted-foreground">{ui.inGuide}</p>
              <ol className="mt-4 space-y-1 border-l border-border">
                {t.sections.map((s, i) => (
                  <li key={s.h}>
                    <a
                      href={`#s${i + 1}`}
                      className={cn(
                        "-ml-px block border-l-2 py-1.5 pl-4 text-body transition-colors",
                        active === i ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.h.replace(/^\d+\.\s*/, "")}
                    </a>
                  </li>
                ))}
                {ex && (
                  <li><a href="#faq" className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-body text-muted-foreground hover:text-foreground">{ui.faqNav}</a></li>
                )}
              </ol>
              <a href="#plans" className="mt-6 inline-flex items-center gap-2 text-body font-semibold text-[hsl(var(--brand-accent-active))] dark:text-primary">
                {ui.seePlans} <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </nav>

          <article className="min-w-0 max-w-[680px]">
            {ex && (
              <aside className="mb-12 rounded-radius-xl bg-card p-6 md:p-8">
                <p className="font-semibold" style={{ fontSize: "1.375rem", letterSpacing: "-0.02em" }}>{ui.inShort}</p>
                <ul className="mt-4 space-y-3">
                  {ex.takeaways.map((k) => (
                    <li key={k} className="flex items-start gap-3 text-body md:text-lg">
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[hsl(var(--brand-accent-active))] dark:text-primary"><Check className="h-3 w-3" /></span>
                      {k}
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {t.sections.map((s, i) => (
              <div key={s.h}>
                <section id={`s${i + 1}`} data-sec={i} className="scroll-mt-24 pb-10">
                  <h2 className="font-semibold" style={{ fontSize: "clamp(1.5rem, 2.4vw, 1.875rem)", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
                    <span className="mr-2 text-[hsl(var(--brand-accent-active))] dark:text-primary">{i + 1}.</span>
                    {s.h.replace(/^\d+\.\s*/, "")}
                  </h2>
                  <div className="mt-4 space-y-5">
                    {s.p.map((para) => (
                      <p key={para.slice(0, 40)} className="text-[1.0625rem] leading-[1.75] text-foreground/80 md:text-lg">{para}</p>
                    ))}
                  </div>
                </section>
                {/* Halfway down, the plans the guide is about — where a reader is ready to act. */}
                {i === Math.floor((t.sections.length - 1) / 2) && items.length > 0 && (
                  <a href="#plans" className="group mb-10 flex items-center gap-4 rounded-radius-xl bg-foreground p-5 text-background transition-opacity hover:opacity-90">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><LayoutList className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold">{ui.plansNow(items.length)}{cheapest ? ` · ${ui.from} $${Math.round(cheapest / 100)}` : ""}</span>
                      <span className="block text-meta opacity-70">{ui.inlineCta}</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </a>
                )}
              </div>
            ))}

            {/* Byline again at the end, and a way to pass it on. */}
            <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
              <p className="text-meta text-muted-foreground">{ui.by} · {ui.updated} <time dateTime={g.updated}>{g.updated}</time></p>
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${t.title} ${self}`)}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-body font-semibold hover:bg-muted/70"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(self ?? "").then(() => toast.success(ui.copied)); }}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-body font-semibold hover:bg-muted/70"
                >
                  <LinkIcon className="h-4 w-4" /> {ui.copy}
                </button>
              </div>
            </footer>
          </article>
        </div>
      </section>

      {/* ─── The plans it is about ─── */}
      <section id="plans" className="app-container scroll-mt-20 pb-16 md:pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <TwoTone accent={ui.plansAccent} plain={ui.plansPlain} />
          {cheapest && (
            <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-body font-semibold">
              <Tag className="h-4 w-4" /> {ui.from} ${Math.round(cheapest / 100)}
            </span>
          )}
        </div>
        {cars && (
          <Link to="/vehicles" className="group mt-8 flex items-center gap-4 rounded-radius-xl bg-card p-6 transition-colors hover:bg-muted/70">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-radius-md bg-primary/15 text-[hsl(var(--brand-accent-active))] dark:text-primary">
              <Car className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-title font-semibold">{cars.h1}</span>
              <span className="block text-body text-muted-foreground">{cars.description}</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
        {isLoading ? (
          <div className="mt-8 grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[220px]" />)}
          </div>
        ) : items.length > 0 ? (
          <div className="stagger mt-8 grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4 xl:grid-cols-5">
            {items.map((p) => <PlanTile key={p.id} plan={p} />)}
          </div>
        ) : null}
      </section>

      {ex && <Faq items={ex.faq} accent={ui.faqAccent} plain={ui.faqPlain} />}

      {/* ─── More guides ─── */}
      <section className="app-container pb-16 md:pb-24">
        <TwoTone accent={ui.moreAccent} plain={ui.morePlain} />
        <ul className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {GUIDES.filter((x) => x.slug !== g.slug).slice(0, 3).map((x) => (
            <li key={x.slug}><GuideCard g={x} lang={lang} /></li>
          ))}
        </ul>
      </section>

      <CtaPanel lang={lang} to={ctaTo} />
    </MarketingPage>
  );
}
