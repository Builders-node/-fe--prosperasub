import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ShelfHeader } from "@/components/discovery/homePlans";
import { GuideCoverArt } from "@/components/discovery/guideCoverArt";
import { GUIDES, guideMinutes } from "@/lib/seo/guides";
import { inSpanishUrl } from "@/lib/seo/lang";
import { cn } from "@/lib/utils";

/**
 * "Guides" on the home page — the blog, as a row of cards: a drawn cover, the
 * guide's title under it, the reading time. Swipes on a phone; on a laptop
 * four sit across and two round arrows on the edges page through the rest.
 *
 * The guides themselves live in lib/seo/guides.ts (one list for the app and
 * the robot pages); this only shows them. Links are relative, so under /es
 * they stay in Spanish.
 */

const UI = {
  en: { title: "Guides", subtitle: "Plain answers about Roatán", all: "All guides", guide: "Guide", minutes: (n: number) => `${n} min read`, prev: "Previous guides", next: "More guides" },
  es: { title: "Guías", subtitle: "Respuestas claras sobre Roatán", all: "Todas las guías", guide: "Guía", minutes: (n: number) => `${n} min de lectura`, prev: "Guías anteriores", next: "Más guías" },
};

function Arrow({ dir, hidden, label, onClick }: { dir: "prev" | "next"; hidden: boolean; label: string; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      tabIndex={hidden ? -1 : 0}
      className={cn(
        // Sits on the middle of the covers, half over the edge, like a page turn.
        "absolute top-[calc((100%-8rem)/2)] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-foreground shadow-figma transition-opacity hover:bg-muted md:flex",
        dir === "prev" ? "-left-5" : "-right-5",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function GuidesRail() {
  const lang = inSpanishUrl() ? "es" : "en";
  const ui = UI[lang];
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // One page at a time: as many cards as fit, less a sliver so the eye keeps its place.
  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  if (GUIDES.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={ui.title}>
      <ShelfHeader
        title={ui.title}
        subtitle={ui.subtitle}
        action={
          <Link
            to="/guides"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-body font-semibold text-foreground transition-colors hover:bg-inset"
          >
            {ui.all}
            <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="relative">
        <Arrow dir="prev" hidden={edges.start} label={ui.prev} onClick={() => page(-1)} />
        <div
          ref={scroller}
          onScroll={measure}
          className="-mx-space-4 flex snap-x snap-mandatory scroll-px-space-4 gap-3 overflow-x-auto px-space-4 pb-2 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:gap-4 md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {GUIDES.map((g) => {
            const t = g[lang];
            return (
              <Link
                key={g.slug}
                to={`/guides/${g.slug}`}
                className="group flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-radius-lg bg-card shadow-figma transition-transform active:scale-[0.99] sm:w-[46%] md:w-[calc((100%-3rem)/4)]"
              >
                <span className="relative block aspect-[5/3] overflow-hidden">
                  <GuideCoverArt
                    slug={g.slug}
                    className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-105 dark:brightness-90"
                  />
                </span>
                <span className="flex h-[6.5rem] flex-col md:h-[7.5rem] px-4 pb-4 pt-3">
                  <span className="line-clamp-2 text-body md:line-clamp-3 font-semibold text-foreground group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2">
                    {t.title}
                  </span>
                  <span className="mt-auto text-meta text-muted-foreground">
                    {ui.guide} · {ui.minutes(guideMinutes(g, lang))}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
        <Arrow dir="next" hidden={edges.end} label={ui.next} onClick={() => page(1)} />
      </div>
    </section>
  );
}
