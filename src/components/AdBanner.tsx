import { useState, useEffect, useMemo, useRef } from "react";
import { useActiveAds } from "@/hooks/useActiveAd";
import { cn } from "@/lib/utils";
import type { Ad } from "@/types/ad";

const ROTATE_MS = 5000; // auto-advance interval
const dismissKey = (sig: string) => `ad_dismissed_${sig}`;

/**
 * Full-width promotional banner driven by the admin-managed `ads` table.
 * When multiple active ads exist for a placement it becomes an auto-advancing
 * slider. Dismissal hides the whole banner (remembered per ad-set).
 */
export function AdBanner({ placement }: { placement: string }) {
  const { data: ads = [] } = useActiveAds(placement);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Touch / drag state for finger-swiping between banners.
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const dragRef = useRef(0);                     // latest finger offset (ref = no stale reads)
  const [drag, setDrag] = useState(0);           // same value as state, for the visual transform
  const [dragging, setDragging] = useState(false);

  // Signature of the current ad set — used for per-set dismissal + reset.
  const signature = useMemo(() => ads.map((a) => a.id).join("_"), [ads]);

  // Reset to the first slide whenever the set of ads changes.
  useEffect(() => {
    setIndex(0);
  }, [signature]);

  // Auto-advance (paused on hover/drag, skipped when there's a single ad).
  useEffect(() => {
    if (ads.length <= 1 || paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % ads.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [ads.length, paused]);

  if (ads.length === 0) return null;

  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + ads.length) % ads.length);

  const onTouchStart = (e: React.TouchEvent) => {
    if (ads.length <= 1) return;
    startXRef.current = e.touches[0].clientX;
    swipedRef.current = false;
    setDragging(true);
    setPaused(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const dx = e.touches[0].clientX - startXRef.current;
    if (Math.abs(dx) > 6) swipedRef.current = true;
    dragRef.current = dx;
    setDrag(dx);
  };

  const onTouchEnd = () => {
    if (startXRef.current === null) return;
    const dx = dragRef.current;
    const width = containerRef.current?.offsetWidth ?? 1;
    const threshold = Math.min(64, width * 0.18);
    if (ads.length > 1 && Math.abs(dx) > threshold) go(dx < 0 ? 1 : -1);
    startXRef.current = null;
    dragRef.current = 0;
    setDragging(false);
    setDrag(0);
    setPaused(false);
  };

  const alreadyDismissed = (() => {
    try {
      return localStorage.getItem(dismissKey(signature)) === "1";
    } catch {
      return false;
    }
  })();
  if (alreadyDismissed) return null;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      role="region"
      aria-label="Promotions"
    >
      {/* Sliding track — follows the finger while dragging */}
      <div
        className={cn("flex", !dragging && "transition-transform duration-500 ease-out")}
        style={{ transform: `translateX(calc(-${index * 100}% + ${drag}px))` }}
      >
        {ads.map((ad) => (
          <AdSlide key={ad.id} ad={ad} onClickCapture={(e) => { if (swipedRef.current) { e.preventDefault(); } }} />
        ))}
      </div>

      {/* Dot indicators — kept on the right edge so they never overlap the centered label */}
      {ads.length > 1 && (
        <div className="absolute inset-y-0 right-2 z-10 flex items-center gap-1">
          {ads.map((ad, i) => (
            <button
              key={ad.id}
              type="button"
              aria-label={`Go to ad ${i + 1}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIndex(i); }}
              className="group flex h-6 items-center px-1"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full bg-white/45 transition-all",
                  i === index ? "w-4 bg-white/90" : "w-1.5 group-hover:bg-white/70",
                )}
              />
            </button>
          ))}
        </div>
      )}

    </div>
  );
}

function AdSlide({ ad, onClickCapture }: { ad: Ad; onClickCapture?: (e: React.MouseEvent) => void }) {
  return (
    <a
      href={ad.link_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${ad.label} (advertisement)`}
      onClickCapture={onClickCapture}
      className="relative block w-full shrink-0 overflow-hidden"
      style={{
        background: `linear-gradient(90deg, ${ad.gradient_from} 0%, ${ad.gradient_via} 45%, ${ad.gradient_to} 100%)`,
      }}
    >
      {/* Ad label */}
      <span
        className="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 text-[9px] font-medium uppercase tracking-wider sm:block"
        style={{ color: ad.text_color, opacity: 0.45 }}
      >
        Ad
      </span>

      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2.5 px-12 py-2.5 sm:gap-3">
        <span
          className="text-sm font-black uppercase tracking-wide sm:text-base"
          style={{ color: ad.text_color }}
        >
          {ad.label}
        </span>
        {ad.badge_text && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold"
            style={{ background: ad.badge_bg, color: ad.badge_text_color }}
          >
            {ad.badge_text}
          </span>
        )}
        {ad.cta_text && (
          <span
            className="hidden text-xs font-medium md:inline"
            style={{ color: ad.text_color, opacity: 0.85 }}
          >
            {ad.cta_text}
          </span>
        )}
      </div>
    </a>
  );
}
