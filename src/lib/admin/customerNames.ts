import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Resolving customer display names, safely.
 *
 * `users.id` is a `uuid` column, but legacy rows can point at a Google-sub id
 * such as `google-114129439113350538026`. PostgREST rejects the WHOLE
 * `id=in.(…)` batch with 22P02 the moment one non-uuid value is in the list —
 * so a single bad row doesn't lose one name, it loses every name in the query.
 *
 * That failure is invisible: the request 400s, `data` is null, the map comes
 * back empty, and each row quietly falls through to whatever fallback the
 * caller had. It's why the dashboard showed "Unknown" for cleaning (no
 * fallback) while food and beach looked fine (they carry `customer_name`), and
 * why /admin/subscriptions rendered truncated ids instead of names.
 *
 * Ten call sites were building this batch by hand. They now share this.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface UserLite {
  id: string;
  name?: string | null;
  display_name?: string | null;
  email?: string | null;
}

/**
 * Fetch users for a mixed bag of ids, dropping the ones `users.id` can't hold.
 *
 * An id in the other shape has no row to find anyway — the name for those
 * comes from `customer_name` on the sale, or from the linked client.
 */
export async function fetchUsersByIds(ids: Array<string | null | undefined>): Promise<Map<string, UserLite>> {
  const unique = Array.from(new Set(ids.filter(isUserUuid)));
  if (unique.length === 0) return new Map();
  const { data } = await supabaseDb
    .from("users")
    .select("id, name, display_name, email")
    .in("id", unique);
  return new Map((data ?? []).map((u: any) => [String(u.id), u as UserLite]));
}

/** Company/household names for client-backed rows, which have no user at all. */
export async function fetchClientNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  if (unique.length === 0) return new Map();
  const { data } = await supabaseDb
    .from("cleaning_clients")
    .select("id, company_name, contact_person")
    .in("id", unique);
  return new Map(
    (data ?? [])
      .map((c: any) => [String(c.id), (c.company_name || c.contact_person || "") as string])
      .filter(([, name]) => !!name) as Array<[string, string]>,
  );
}

/**
 * The one place that decides what a customer is called.
 *
 * Order matters: the account's own name wins, then the name captured on the
 * order, then the client the row belongs to, then the email. Never a truncated
 * id — "e869d031" is not a name, it just looks enough like one to send an
 * admin looking for a customer by that name.
 */
export function customerNameFrom(opts: {
  user?: UserLite | null;
  customerName?: string | null;
  clientName?: string | null;
  fallback?: string;
}): string {
  const { user, customerName, clientName, fallback = "—" } = opts;
  return (
    user?.display_name ||
    user?.name ||
    customerName ||
    clientName ||
    user?.email ||
    fallback
  );
}
