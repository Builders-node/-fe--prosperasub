import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseDb } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the real DB UUID for the current user.
 * Always looks up by email to get the canonical users.id —
 * never falls back to the JWT id (which may be "google-xxxxx" or similar).
 */
export function useUserUuid() {
  const { userData, isAuthenticated } = useAuth();

  const { data: uuid } = useQuery({
    queryKey: ["user-uuid", userData?.email],
    queryFn: async () => {
      if (!userData?.email) return null;
      // Always resolve via DB email lookup — the JWT id may be a Google-format id
      const { data } = await supabaseDb
        .from("users")
        .select("id")
        .eq("email", userData.email)
        .maybeSingle();
      if (data?.id) return data.id as string;
      // Last resort: only use userData.id if it looks like a real UUID
      if (userData?.id && UUID_RE.test(userData.id)) return userData.id;
      return null;
    },
    enabled: isAuthenticated && !!userData?.email,
    staleTime: Infinity,
  });

  // Only return a uuid that looks like a real UUID (never return "google-xxxxx")
  if (uuid && UUID_RE.test(uuid)) return uuid;
  if (userData?.id && UUID_RE.test(userData.id)) return userData.id;
  return null;
}
