import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Resolves the real Supabase UUID for the current user.
 * The NestJS auth session may store a custom ID (e.g. "google-..."),
 * but the DB tables use the users.id UUID.
 */
export function useUserUuid() {
  const { userData, isAuthenticated } = useAuth();

  const { data: uuid } = useQuery({
    queryKey: ["user-uuid", userData?.email],
    queryFn: async () => {
      if (!userData?.email) return null;
      const { data } = await supabaseDb
        .from("users")
        .select("id")
        .eq("email", userData.email)
        .maybeSingle();
      return data?.id ?? userData?.id ?? null;
    },
    enabled: isAuthenticated && !!userData?.email,
    staleTime: Infinity,
  });

  return uuid ?? userData?.id ?? null;
}
