import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-radius-xl bg-card px-space-6 text-center",
        compact ? "py-space-8" : "min-h-[320px] py-space-12",
        className
      )}
    >
      <div className={cn("relative mb-space-8", compact ? "h-24 w-24" : "h-36 w-36")}>
        <div className="absolute left-[18%] top-[22%] h-[62%] w-[7%] rounded-radius-xs bg-foreground/10" />
        <svg
          viewBox="0 0 140 140"
          aria-hidden="true"
          className="h-full w-full text-foreground/10"
        >
          <path
            d="M39 25h72l6 94H30L39 25Z"
            fill="currentColor"
          />
          <path
            d="M42 25c5 6 10 6 15 0 5 6 10 6 15 0 5 6 10 6 15 0 5 6 10 6 15 0"
            fill="none"
            stroke="hsl(var(--background))"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M58 65c5 8 13 8 18 0M91 65c5 8 13 8 18 0"
            fill="none"
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity="0.45"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M69 93c7-13 24-13 31 0"
            fill="none"
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity="0.45"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h3 className={cn("max-w-xl font-display font-black leading-tight", compact ? "text-2xl" : "text-3xl md:text-4xl")}>
        {title}
      </h3>
      {description && (
        <p className="mt-space-3 max-w-md text-sm font-medium text-muted-foreground md:text-base">
          {description}
        </p>
      )}
      {action && <div className="mt-space-6">{action}</div>}
    </div>
  );
}
