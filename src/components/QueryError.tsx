import { AlertTriangle, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n";

interface Props {
  /** Optional short title. Defaults to the localized "Couldn't load this". */
  title?: string;
  /** Free-form message from the error. If a plain Error is passed, `.message` is used. */
  error?: Error | string | null;
  /** Called when the user taps Retry. Typically a React Query `refetch`. */
  onRetry?: () => void;
  /** Disable Retry while the refetch is in flight. */
  retrying?: boolean;
  /** Trim to a compact inline banner (no icon, tighter padding). */
  compact?: boolean;
}

/**
 * Inline data-load failure UI. Drop this in place of the empty state when a
 * React Query result is `isError` — the user sees WHY it's empty and can
 * retry without reloading the page. Pair with `refetch` from useQuery.
 */
export function QueryError({ title, error, onRetry, retrying, compact }: Props) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("error.couldntLoad");
  const message = error instanceof Error ? error.message : (typeof error === "string" ? error : "");

  return (
    <div className={compact
      ? "flex items-center justify-between gap-3 rounded-2xl bg-red-500/10 px-4 py-3"
      : "flex flex-col items-center justify-center rounded-3xl bg-red-500/5 px-4 py-10 text-center"}>
      {!compact && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
      )}
      <div className={compact ? "min-w-0 flex-1" : ""}>
        <p className={`font-semibold text-foreground ${compact ? "text-sm truncate" : ""}`}>{resolvedTitle}</p>
        {message && (
          <p className={`text-xs text-muted-foreground ${compact ? "truncate" : "mt-1"}`}>{message}</p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-60 ${
            compact ? "px-3 py-1.5 text-xs font-semibold" : "mt-4 px-4 py-2 text-sm font-bold"
          }`}
        >
          <RefreshCw className={`${compact ? "h-3 w-3" : "h-4 w-4"} ${retrying ? "animate-spin" : ""}`} />
          {retrying ? t("error.retrying") : t("error.retry")}
        </button>
      )}
    </div>
  );
}
