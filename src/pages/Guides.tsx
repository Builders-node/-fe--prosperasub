import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, Car } from "lucide-react";
import { useSeo } from "@/hooks/useSeo";
import { useGoBack } from "@/hooks/useGoBack";
import { BrowseLayout } from "@/components/layout/BrowseLayout";
import { DetailHeader } from "@/components/patterns/DetailHeader";
import { Breadcrumbs } from "@/components/patterns/Breadcrumbs";
import { Skeleton } from "@/components/patterns/Skeleton";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { Button } from "@/components/ui/button";
import { PlanTile, useHomePlans } from "@/components/discovery/homePlans";
import { GUIDES, GUIDES_INDEX, guideBySlug } from "@/lib/seo/guides";
import { serviceSeo } from "@/lib/seo/serviceSeo";
import { inSpanishUrl } from "@/lib/seo/lang";

/**
 * `/guides` and `/guides/:slug` — practical answers to what people search
 * before they buy a service on Roatán, each ending in the plans it is about.
 *
 * The words live in lib/seo/guides.ts, which the robot pages (middleware.ts)
 * read too, so a person and a crawler see the same text. Both languages: the
 * app runs under /es for Spanish, and every link here stays inside it.
 */
const SITE = "https://everysub.net";

const useLang = () => (inSpanishUrl() ? "es" : "en") as "en" | "es";

export default function GuidesIndex() {
  const lang = useLang();
  const idx = GUIDES_INDEX[lang];
  const goBack = useGoBack("/discovery");
  useSeo({
    title: idx.title,
    description: idx.description,
    path: "/guides",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g[lang].title, url: `${SITE}${lang === "es" ? "/es" : ""}/guides/${g.slug}` })),
    },
  });

  return (
    <BrowseLayout>
      <DetailHeader title={idx.h1} centreLabel={lang === "es" ? "Guías" : "Guides"} onBack={goBack} />
      <main className="app-container space-y-space-5 pb-10 pt-space-4">
        <Breadcrumbs className="hidden md:block" items={[{ label: lang === "es" ? "Inicio" : "Home", href: "/discovery" }, { label: lang === "es" ? "Guías" : "Guides" }]} />
        <header className="px-1">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">{idx.h1}</h1>
          <p className="mt-1 max-w-[720px] text-title text-muted-foreground">{idx.intro}</p>
        </header>
        <ul className="stagger grid gap-space-3 md:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link
                to={`/guides/${g.slug}`}
                className="flex h-full gap-space-3 rounded-radius-lg bg-card p-space-4 transition-colors hover:bg-muted/70"
              >
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-title font-semibold text-foreground">{g[lang].title}</span>
                  <span className="mt-1 block text-body text-muted-foreground">{g[lang].description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </BrowseLayout>
  );
}

export function GuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const lang = useLang();
  const idx = GUIDES_INDEX[lang];
  const g = guideBySlug(slug);
  const goBack = useGoBack("/guides");
  const { data: plans = [], isLoading } = useHomePlans();
  const t = g?.[lang];
  const self = g ? `${SITE}${lang === "es" ? "/es" : ""}/guides/${g.slug}` : null;

  useSeo({
    title: t?.title ?? null,
    description: t?.description ?? null,
    path: g ? `/guides/${g.slug}` : null,
    type: "article",
    image: `${SITE}/for-business/hero.jpg`,
    jsonLd: g && t ? {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: t.h1,
      description: t.description,
      inLanguage: lang,
      datePublished: g.updated,
      dateModified: g.updated,
      mainEntityOfPage: self,
      image: `${SITE}/for-business/hero.jpg`,
      author: { "@type": "Organization", name: "EverySub", url: SITE },
      publisher: { "@type": "Organization", name: "EverySub", logo: `${SITE}/icon-512.png` },
    } : null,
  });

  // The guide's services, live: every plan on sale in them right now.
  const items = useMemo(
    () => (g ? plans.filter((p) => p.provider?.archetype_key && g.services.includes(p.provider.archetype_key)) : []),
    [g, plans],
  );

  if (!g || !t) {
    return (
      <BrowseLayout>
        <DetailHeader title={idx.h1} onBack={goBack} />
        <main className="app-container pb-10 pt-space-6">
          <YdEmptyState
            icon={BookOpen}
            title={lang === "es" ? "Guía no encontrada" : "Guide not found"}
            action={<Button asChild size="sm" variant="secondary"><Link to="/guides">{idx.all}</Link></Button>}
          />
        </main>
      </BrowseLayout>
    );
  }

  const cars = g.services.includes("vehicles") ? serviceSeo("vehicles", lang) : null;

  return (
    <BrowseLayout>
      <DetailHeader title={t.h1} centreLabel={lang === "es" ? "Guía" : "Guide"} onBack={goBack} />
      <main className="app-container space-y-space-5 pb-10 pt-space-4">
        <Breadcrumbs
          className="hidden md:block"
          items={[
            { label: lang === "es" ? "Inicio" : "Home", href: "/discovery" },
            { label: lang === "es" ? "Guías" : "Guides", href: "/guides" },
            { label: t.h1 },
          ]}
        />
        <article className="max-w-[720px] space-y-space-4 px-1">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">{t.h1}</h1>
            <p className="text-caption text-muted-foreground">{idx.updated} {g.updated}</p>
            <p className="text-title leading-relaxed text-foreground">{t.intro}</p>
          </header>
          {t.sections.map((s) => (
            <section key={s.h} className="space-y-2">
              <h2 className="text-heading font-semibold text-foreground">{s.h}</h2>
              {s.p.map((para) => (
                <p key={para.slice(0, 40)} className="text-body leading-relaxed text-muted-foreground">{para}</p>
              ))}
            </section>
          ))}
        </article>

        <section className="space-y-space-3">
          <h2 className="px-1 text-heading font-semibold text-foreground">{idx.more}</h2>
          {cars && (
            <Link to="/vehicles" className="flex items-center gap-space-3 rounded-radius-lg bg-card p-space-4 transition-colors hover:bg-muted/70">
              <Car className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="text-title font-semibold text-foreground">{cars.h1}</span>
            </Link>
          )}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[220px]" />)}
            </div>
          ) : items.length > 0 ? (
            <div className="stagger grid grid-cols-2 gap-x-2 gap-y-5 md:grid-cols-4 xl:grid-cols-5">
              {items.map((p) => <PlanTile key={p.id} plan={p} />)}
            </div>
          ) : null}
        </section>

        <section className="space-y-space-2">
          <h2 className="px-1 text-heading font-semibold text-foreground">{idx.all}</h2>
          <ul className="grid gap-space-2 md:grid-cols-2">
            {GUIDES.filter((x) => x.slug !== g.slug).map((x) => (
              <li key={x.slug}>
                <Link to={`/guides/${x.slug}`} className="block rounded-radius-lg bg-card p-space-4 text-title font-semibold text-foreground transition-colors hover:bg-muted/70">
                  {x[lang].title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </BrowseLayout>
  );
}
