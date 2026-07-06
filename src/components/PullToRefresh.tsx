import { useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Props {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
}

const THRESHOLD = 70;
const MAX = 110;

/**
 * Native-style pull-to-refresh for mobile. Only activates when the page is
 * scrolled to the very top and the user drags downward. No-op on desktop.
 */
export function PullToRefresh({ onRefresh, children }: Props) {
  const isMobile = useIsMobile();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  if (!isMobile) return <>{children}</>;

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pulling.current) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && window.scrollY <= 0) {
      setPull(Math.min(MAX, dy * 0.5)); // resistance
    } else {
      pulling.current = false;
      setPull(0);
    }
  };

  const onTouchEnd = async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const armed = pull >= THRESHOLD;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className={cn("flex items-center justify-center overflow-hidden text-muted-foreground", !pulling.current && "transition-[height] duration-200")}
        style={{ height: pull }}
        aria-hidden
      >
        {refreshing ? (
          <Spinner size="md" className="text-primary" />
        ) : (
          <ArrowDown
            className={cn("h-5 w-5 transition-transform", armed ? "rotate-180 text-primary" : "")}
            style={{ opacity: Math.min(1, pull / THRESHOLD) }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
