import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";

const ensureLightningSession = async (): Promise<void> => {
  const pubkey = localStorage.getItem("lightning_pubkey");
  if (pubkey) {
    await supabase.rpc('set_lightning_session', { p_pubkey: pubkey });
  }
};

export function useFavorites() {
  const { userData, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: favorites = [] } = useQuery({
    queryKey: ["favorites", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return [];
      
      await ensureLightningSession();
      
      const { data, error } = await supabase
        .from("favorites")
        .select("*")
        .eq("user_id", userData.id);
      
      if (error) throw error;
      return data;
    },
    enabled: isAuthenticated && !!userData?.id,
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ restaurantId, planId }: { restaurantId?: string; planId?: string }) => {
      if (!userData?.id) throw new Error("Not authenticated");
      if (!restaurantId && !planId) throw new Error("Favorite target is missing");
      
      await ensureLightningSession();
      
      // Check if already favorited
      const existingFavorite = favorites.find(
        (f) => (restaurantId && f.restaurant_id === restaurantId) || 
               (planId && f.plan_id === planId)
      );

      if (existingFavorite) {
        // Remove favorite
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("id", existingFavorite.id);
        if (error) throw error;
        return { action: "removed" };
      } else {
        // Add favorite
        const { error } = await supabase
          .from("favorites")
          .insert({
            user_id: userData.id,
            restaurant_id: restaurantId || null,
            plan_id: planId || null,
          });
        if (error) throw error;
        return { action: "added" };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(result.action === "added" ? "Added to favorites!" : "Removed from favorites");
    },
    onError: (error: Error) => {
      if (error.message === "Not authenticated") {
        toast.error("Please sign in to save favorites");
        openAuthModal("login", location.pathname + location.search);
      } else {
        toast.error("Could not update favorites");
      }
    },
  });

  const isRestaurantFavorite = (restaurantId: string) => 
    favorites.some((f) => f.restaurant_id === restaurantId);

  const isPlanFavorite = (planId: string) => 
    favorites.some((f) => f.plan_id === planId);

  return {
    favorites,
    toggleFavorite: toggleFavorite.mutate,
    isToggling: toggleFavorite.isPending,
    isRestaurantFavorite,
    isPlanFavorite,
  };
}
