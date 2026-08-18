import { useSearchParams } from "react-router-dom";

/**
 * A tab that survives a reload.
 *
 * Tabs were uncontrolled (`defaultValue`) everywhere, so refreshing a page —
 * or following a link back to it — always landed on the first tab. A provider
 * halfway through the day's list, or an admin reading Net Profit, lost their
 * place on every reload.
 *
 * The rules, in one place because four screens were about to grow four
 * slightly different versions of them:
 *
 *   • The first tab writes no parameter, so a plain URL stays plain.
 *   • An unknown or no-longer-visible value falls back to the first tab rather
 *     than rendering an empty page — bookmarks outlive renames.
 *   • Switching REPLACES the history entry. Back should leave the screen, not
 *     walk the tabs you flicked through to get here.
 *   • Other parameters are preserved, so this composes with `?providerId=`,
 *     `?view=`, filters and anything else already in the URL.
 */
export function useTabParam<T extends string>(
  values: readonly T[],
  options?: { key?: string; fallback?: T },
): [T, (next: T) => void] {
  const key = options?.key ?? "tab";
  const [params, setParams] = useSearchParams();

  const first = options?.fallback ?? values[0];
  const requested = params.get(key) as T | null;
  const active = (requested && values.includes(requested) ? requested : first) as T;

  const setActive = (next: T) => {
    const q = new URLSearchParams(params);
    if (next === first) q.delete(key);
    else q.set(key, next);
    setParams(q, { replace: true });
  };

  return [active, setActive];
}
