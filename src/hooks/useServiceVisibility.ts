import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { ALL_SERVICES, SERVICE_KEYS, VISIBILITY_KEY_TO_SERVICE, type ServiceKey } from "@/lib/services/registry";

/** Kept as a re-export so existing imports don't break. */
export type ServiceCategory = ServiceKey;

export type ServiceVisibility = Record<ServiceKey, boolean>;

const ALL_VISIBLE: ServiceVisibility = Object.fromEntries(
  SERVICE_KEYS.map((k) => [k, true]),
) as ServiceVisibility;

/**
 * Reads which service categories are enabled for regular users, from the public
 * `global_settings` table. Categories default to visible when no flag is set.
 * Admins decide these in Platform Settings; the gating itself is applied by callers.
 */
export function useServiceVisibility() {
  return useQuery<ServiceVisibility>({
    queryKey: ["service-visibility"],
    queryFn: async () => {
      const keys = ALL_SERVICES.map((s) => s.visibilityKey);
      const { data, error } = await supabaseDb
        .from("global_settings")
        .select("key,value")
        .in("key", keys);
      if (error) return ALL_VISIBLE;

      const map = new Map((data ?? []).map((r: any) => [r.key, r.value]));
      const result = { ...ALL_VISIBLE };
      for (const [visKey, srvKey] of Object.entries(VISIBILITY_KEY_TO_SERVICE)) {
        const v = map.get(visKey);
        result[srvKey] = v === undefined || v === null ? true : v === true || v === "true";
      }
      return result;
    },
    staleTime: 60_000,
    // No placeholder: callers wait for the real value so hidden categories never
    // flash in before being filtered out. ALL_VISIBLE is only the error fallback.
  });
}
