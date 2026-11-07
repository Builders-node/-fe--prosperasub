import { useSearchParams } from "react-router-dom";
import { parseRollupPeriod, type RollupPeriod } from "@/lib/analytics/platformRollup";

/**
 * The period an admin money screen is showing, kept in `?period=` so Today and
 * Analytics share it through a link, a reload and Back.
 */
export function useRollupPeriod(fallback: RollupPeriod = "30d") {
  const [params, setParams] = useSearchParams();
  const period = parseRollupPeriod(params.get("period"), fallback);
  const setPeriod = (p: RollupPeriod) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p === fallback) next.delete("period"); else next.set("period", p);
      return next;
    }, { replace: true });
  return [period, setPeriod] as const;
}
