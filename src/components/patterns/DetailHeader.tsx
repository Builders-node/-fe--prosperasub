import { useEffect, useState, type ReactNode } from "react";
import { HomeHeader } from "@/components/HomeHeader";
import { KeyboardArrowLeftIcon } from "@/components/icons/FigmaIcons";
import { cn } from "@/lib/utils";

/**
 * The top of a detail page that leads with a photograph.
 *
 * On a phone the bar floats on the picture — no background of its own, the
 * hero's scrim does that job — and takes one once the photo has scrolled past,
 * because white icons on a white card cannot be seen. On a desktop it is the
 * ordinary title bar instead, since the photo is not under the chrome there.
 *
 * Lifted out of PlanDetail so the car page could have the same header rather
 * than a copy of its measurements. Two pages drawing the same bar from the
 * same source is the whole point; a second implementation would drift the
 * first time either was touched.
 */
export function DetailHeader({
  title,
  centreLabel,
  onBack,
  rightAction,
  /** True when a photograph sits under the bar on a phone. */
  overPhoto,
}: {
  /** The desktop title bar's heading. */
  title: string;
  /** The small centred label on the phone bar — usually the service. */
  centreLabel?: string;
  onBack: () => void;
  rightAction?: ReactNode;
  overPhoto?: boolean;
}) {
  // 220px is just before the 280px photo clears the 56px bar.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 220);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 transition-colors md:hidden",
          overPhoto && !scrolled ? "text-white" : "bg-card text-foreground",
          overPhoto && "-mb-14",
        )}
      >
        <div className="relative flex h-14 items-center justify-between p-2">
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/10"
          >
            <KeyboardArrowLeftIcon className="h-6 w-6" />
          </button>
          {centreLabel && (
            <span className="pointer-events-none absolute left-1/2 w-[60%] -translate-x-1/2 truncate text-center text-[16px] font-semibold tracking-[-0.32px]">
              {centreLabel}
            </span>
          )}
          {rightAction}
        </div>
      </header>

      <div className="hidden md:block">
        <HomeHeader title={title} showBackButton onBack={onBack} bare rightAction={rightAction} />
      </div>
    </>
  );
}
