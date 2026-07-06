import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  /** When set, stars are clickable and call onChange with 1–5. */
  onChange?: (rating: number) => void;
  size?: number;
  className?: string;
}

/** Star rating — read-only by default, interactive when `onChange` is provided. */
export function StarRating({ value, onChange, size = 16, className }: Props) {
  const interactive = !!onChange;
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(value);
        const StarEl = (
          <Star
            style={{ width: size, height: size }}
            className={cn(filled ? "fill-amber-400 text-amber-400" : "fill-transparent text-muted-foreground/40")}
          />
        );
        return interactive ? (
          <button
            key={star}
            type="button"
            onClick={() => onChange!(star)}
            className="transition-transform hover:scale-110"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
          >
            {StarEl}
          </button>
        ) : (
          <span key={star}>{StarEl}</span>
        );
      })}
    </div>
  );
}
