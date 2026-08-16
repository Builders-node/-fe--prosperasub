import { useQuery } from "@tanstack/react-query";
import { useMyProviders } from "@/hooks/useMyProviders";
import { PROVIDER_SERVICES } from "@/lib/services/registry";
import { supabaseDb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserUuid } from "@/hooks/useUserUuid";

export interface MyBusiness {
  /** Universal `providers.id` — what /my-provider/:id takes. */
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  avatarUrl: string | null;
  archetypeKey: string | null;
  sourceKey: string | null;
  role: "owner" | "manager";
}

interface ProviderRow {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  avatar_url: string | null;
  archetype_key: string | null;
  source_service_key: string | null;
  source_provider_id: string | null;
  admin_user_id: string | null;
}

/**
 * Every business the current user owns or helps run, as one list.
 *
 * Membership is recorded in THREE places, and this hook is the only thing that
 * knows it:
 *
 *   1. `providers.admin_user_id`      — the universal owner.
 *   2. `provider_members`             — what the workspace's Team tab writes.
 *   3. the per-service manager tables — `food_restaurant_managers` and friends,
 *      which predate `provider_members` and still hold live rows.
 *
 * Only (1) and (3) were ever read. So somebody added through the Team tab —
 * the platform's own way of adding a manager — got no "My business" card, no
 * entry in this list, and "access was removed" if they typed the URL. The
 * feature wrote a row nothing consulted.
 *
 * The list is universal ids, because the workspace is one page for every
 * service now; a legacy row is resolved to its universal twin through
 * (source_service_key, source_provider_id).
 */
export function useMyBusinesses() {
  const legacyGroups: Array<{ key: string; rows: Array<{ id: string; myRole: "owner" | "manager" }> }> = [];
  let isLoading = false;

  for (const service of PROVIDER_SERVICES) {
    // Rules-of-hooks compliant: PROVIDER_SERVICES is a compile-time constant
    // from the registry, so hook order is stable across renders.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const q = useMyProviders(service);
    if (q.isLoading) isLoading = true;
    if (q.hasAny) legacyGroups.push({ key: service.key, rows: q.providers });
  }

  const { userData } = useAuth();
  const userUuid = useUserUuid();
  const me = userUuid ?? userData?.id ?? null;
  const email = userData?.email ?? null;
  // The legacy answer changes what this query returns, so it is part of the key
  // — otherwise a slow per-service hook resolves after the join and its rows
  // never make it into the list.
  const legacyKey = legacyGroups.map((g) => `${g.key}:${g.rows.map((r) => `${r.id}:${r.myRole}`).join(",")}`).join("|");

  const q = useQuery({
    queryKey: ["my-businesses", me, email, legacyKey],
    enabled: !!me,
    staleTime: 60_000,
    queryFn: async (): Promise<MyBusiness[]> => {
      const [providersRes, membersRes] = await Promise.all([
        supabaseDb
          .from("providers")
          .select("id, name, description, status, avatar_url, archetype_key, source_service_key, source_provider_id, admin_user_id")
          .order("name", { ascending: true }),
        supabaseDb
          .from("provider_members")
          .select("provider_id, role")
          // By email as well as by id: a manager can be invited before they
          // have ever signed in, and the row is keyed by what was typed.
          .or(email ? `user_id.eq.${me},user_email.eq.${email}` : `user_id.eq.${me}`),
      ]);
      if (providersRes.error) throw providersRes.error;
      if (membersRes.error) throw membersRes.error;

      const providers = (providersRes.data ?? []) as ProviderRow[];
      const byLegacy = new Map<string, ProviderRow>();
      providers.forEach((p) => {
        if (p.source_service_key && p.source_provider_id) {
          byLegacy.set(`${p.source_service_key}:${p.source_provider_id}`, p);
        }
      });

      /** universal id → role, strongest wins. */
      const roles = new Map<string, "owner" | "manager">();
      const claim = (id: string, role: "owner" | "manager") => {
        if (role === "owner" || !roles.has(id)) roles.set(id, role);
      };

      providers.forEach((p) => { if (p.admin_user_id && p.admin_user_id === me) claim(p.id, "owner"); });
      (membersRes.data ?? []).forEach((m: { provider_id: string; role: string | null }) => {
        claim(m.provider_id, m.role === "owner" ? "owner" : "manager");
      });
      legacyGroups.forEach(({ key, rows }) => {
        rows.forEach((r) => {
          const universal = byLegacy.get(`${key}:${r.id}`);
          if (universal) claim(universal.id, r.myRole);
        });
      });

      return providers
        .filter((p) => roles.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          avatarUrl: p.avatar_url,
          archetypeKey: p.archetype_key,
          sourceKey: p.source_service_key,
          role: roles.get(p.id)!,
        }));
    },
  });

  const businesses = q.data ?? [];
  return {
    businesses,
    isLoading: isLoading || q.isLoading,
    hasAny: businesses.length > 0,
  };
}
