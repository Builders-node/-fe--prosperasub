import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A list filter that lives in the URL (`?status=pending`), so a reload, Back
 * and a pasted link all land on the same view. The default value is kept out
 * of the URL. Writes replace history — a filter change is not a page.
 */
export function useUrlState<T extends string>(key: string, fallback: T) {
  const [params, setParams] = useSearchParams();
  const value = (params.get(key) ?? fallback) as T;
  const set = useCallback((next: T) => {
    setParams((prev) => {
      const q = new URLSearchParams(prev);
      if (!next || next === fallback) q.delete(key); else q.set(key, next);
      return q;
    }, { replace: true });
  }, [key, fallback, setParams]);
  return [value, set] as const;
}
