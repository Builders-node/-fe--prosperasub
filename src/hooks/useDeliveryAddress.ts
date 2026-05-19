import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DeliveryAddress, normalizeDeliveryAddress } from "@/types/delivery";
import { Json } from "@/integrations/supabase/types";

interface UseDeliveryAddressResult {
  /** The user's default delivery address (normalized) */
  defaultAddress: DeliveryAddress | null;
  /** Whether the address is being loaded */
  isLoading: boolean;
  /** Whether the user has a valid default address */
  hasDefaultAddress: boolean;
}

/**
 * Central hook for accessing the user's delivery address.
 * This is the SINGLE source of truth for delivery address state.
 * 
 * Usage:
 * ```tsx
 * const { defaultAddress, hasDefaultAddress } = useDeliveryAddress();
 * ```
 */
export function useDeliveryAddress(): UseDeliveryAddressResult {
  const { userData, isAuthenticated } = useAuth();

  const { data: userProfile, isLoading } = useQuery({
    queryKey: ["user-profile-delivery", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return null;
      
      const { data, error } = await supabase
        .from("user_profiles")
        .select("default_delivery_address")
        .eq("user_id", userData.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: isAuthenticated && !!userData?.id,
  });

  const rawAddress = userProfile?.default_delivery_address as Json | null;
  const defaultAddress = normalizeDeliveryAddress(rawAddress as any);

  return {
    defaultAddress,
    isLoading,
    hasDefaultAddress: !!defaultAddress?.address,
  };
}
