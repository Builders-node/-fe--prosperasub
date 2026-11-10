import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { PROVIDER_SERVICES } from "@/lib/services/registry";

export interface CustomerBusiness {
  id: string;
  name: string;
  status: string | null;
  avatarUrl: string | null;
  archetypeKey: string | null;
  role: "owner" | "manager";
}

/**
 * Every business a given person owns or helps run — the admin's view of
 * someone else, where `useMyBusinesses` is the signed-in user's own.
 *
 * Same three sources, same "strongest role wins": `providers.admin_user_id`,
 * `provider_members` (by id, or by the email an invite was typed with), and
 * the per-service manager tables that predate it, resolved to universal ids.
 */
export function useCustomerBusinesses(userId: string, email?: string | null) {
  const mail = email?.trim().toLowerCase() || null;
  return useQuery({
    queryKey: ["admin-customer-businesses", userId, mail],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<CustomerBusiness[]> => {
      const who = mail ? `user_id.eq.${userId},user_email.eq.${mail}` : `user_id.eq.${userId}`;
      const legacy = PROVIDER_SERVICES.map((s) => ({ key: s.key, table: s.providers.table, managerTable: s.providers.managerTable }));

      const [providersRes, membersRes, ...legacyRes] = await Promise.all([
        supabaseDb
          .from("providers")
          .select("id, name, status, avatar_url, archetype_key, source_service_key, source_provider_id, admin_user_id"),
        supabaseDb.from("provider_members").select("provider_id, role").or(who),
        ...legacy.flatMap((l) => [
          supabaseDb.from(l.table).select("id").eq("admin_user_id", userId),
          l.managerTable
            ? supabaseDb.from(l.managerTable).select("provider_id").or(who)
            : Promise.resolve({ data: [], error: null }),
        ]),
      ]);
      if (providersRes.error) throw providersRes.error;
      if (membersRes.error) throw membersRes.error;

      const providers = (providersRes.data ?? []) as any[];
      const byLegacy = new Map<string, string>();
      providers.forEach((p) => {
        if (p.source_service_key && p.source_provider_id) byLegacy.set(`${p.source_service_key}:${p.source_provider_id}`, p.id);
      });

      const roles = new Map<string, "owner" | "manager">();
      const claim = (id: string | undefined, role: "owner" | "manager") => {
        if (!id) return;
        if (role === "owner" || !roles.has(id)) roles.set(id, role);
      };

      providers.forEach((p) => { if (p.admin_user_id && String(p.admin_user_id) === userId) claim(p.id, "owner"); });
      (membersRes.data ?? []).forEach((m: any) => claim(m.provider_id, m.role === "owner" ? "owner" : "manager"));
      // A legacy table that errors (dropped, renamed) only loses its own rows.
      legacy.forEach((l, i) => {
        const owned = legacyRes[i * 2] as { data: any[] | null; error: unknown };
        const managed = legacyRes[i * 2 + 1] as { data: any[] | null; error: unknown };
        if (!owned.error) (owned.data ?? []).forEach((r) => claim(byLegacy.get(`${l.key}:${r.id}`), "owner"));
        if (!managed.error) (managed.data ?? []).forEach((r) => claim(byLegacy.get(`${l.key}:${r.provider_id}`), "manager"));
      });

      return providers
        .filter((p) => roles.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status ?? null,
          avatarUrl: p.avatar_url ?? null,
          archetypeKey: p.archetype_key ?? null,
          role: roles.get(p.id)!,
        }))
        .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
    },
  });
}
