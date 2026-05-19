import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  logo_url: string | null;
  is_active: boolean;
  is_owner?: boolean;
}

interface RestaurantContextType {
  /** Currently active restaurant ID from URL */
  restaurantId: string | null;
  /** Currently active restaurant data */
  activeRestaurant: Restaurant | null;
  /** All restaurants the user has access to */
  restaurants: Restaurant[];
  /** Loading state for restaurant data */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Switch to a different restaurant (updates URL) */
  switchRestaurant: (restaurantId: string) => void;
  /** Navigate back to restaurant selection */
  goToRestaurantList: () => void;
  /** Check if user has access to a specific restaurant */
  hasAccessTo: (restaurantId: string) => boolean;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

interface RestaurantProviderProps {
  children: ReactNode;
}

export const RestaurantProvider = ({ children }: RestaurantProviderProps) => {
  const { userData, isSuperAdmin, isUserDataReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // NOTE: This provider wraps its own <Routes/> (in RestaurantAdminRoutes).
  // In that setup, useParams() may not include child route params reliably.
  // So we derive the active restaurant ID from the current pathname.
  const urlRestaurantId = (() => {
    const match = location.pathname.match(/^\/restaurant\/([^/]+)(?:\/|$)/);
    if (!match) return undefined;

    const candidate = match[1];
    // Ignore legacy non-ID segments under /restaurant
    const nonIdSegments = new Set([
      'dashboard',
      'menu',
      'plans',
      'subscribers',
      'meals',
      'wallet',
    ]);
    if (nonIdSegments.has(candidate)) return undefined;

    return candidate;
  })();

  // Fetch all restaurants the user has access to
  const { data: restaurants = [], isLoading, error } = useQuery({
    queryKey: ['user-restaurants', userData?.id, isSuperAdmin],
    queryFn: async (): Promise<Restaurant[]> => {
      if (isSuperAdmin) {
        // Super admins see all restaurants
        const { data, error } = await supabase
          .from('restaurants')
          .select('id, name, description, address, logo_url, is_active')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(r => ({ ...r, is_owner: false }));
      } else if (userData?.id) {
        // Regular admins see restaurants they're linked to via restaurant_admins
        const { data, error } = await supabase
          .from('restaurant_admins')
          .select('restaurant:restaurants(id, name, description, address, logo_url, is_active), is_owner')
          .eq('user_id', userData.id);
        if (error) throw error;
        return (data || [])
          .filter((ra: any) => ra.restaurant)
          .map((ra: any) => ({ 
            ...ra.restaurant, 
            is_owner: ra.is_owner 
          }));
      }
      return [];
    },
    enabled: isUserDataReady && !!userData?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Get the active restaurant based on URL param
  const activeRestaurant = urlRestaurantId 
    ? restaurants.find(r => r.id === urlRestaurantId) || null
    : null;

  // Switch to a different restaurant - updates URL while preserving current page type
  const switchRestaurant = useCallback((newRestaurantId: string) => {
    const currentPath = location.pathname;
    
    // Extract the page type from current path (e.g., /restaurant/:id/subscribers -> subscribers)
    const pathMatch = currentPath.match(/\/restaurant\/[^/]+\/(.+)/);
    const pageType = pathMatch ? pathMatch[1] : 'dashboard';
    
    // Navigate to the same page type with new restaurant ID
    navigate(`/restaurant/${newRestaurantId}/${pageType}`);
  }, [location.pathname, navigate]);

  // Navigate back to restaurant selection
  const goToRestaurantList = useCallback(() => {
    navigate('/restaurant');
  }, [navigate]);

  // Check if user has access to a specific restaurant
  const hasAccessTo = useCallback((checkRestaurantId: string) => {
    if (isSuperAdmin) return true;
    return restaurants.some(r => r.id === checkRestaurantId);
  }, [restaurants, isSuperAdmin]);

  return (
    <RestaurantContext.Provider
      value={{
        restaurantId: urlRestaurantId || null,
        activeRestaurant,
        restaurants,
        isLoading,
        error: error as Error | null,
        switchRestaurant,
        goToRestaurantList,
        hasAccessTo,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurant = () => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within RestaurantProvider');
  }
  return context;
};

/**
 * Hook for restaurant admin pages that require a restaurant to be selected.
 * Throws if no restaurant is selected or user doesn't have access.
 */
export const useRequiredRestaurant = () => {
  const context = useRestaurant();
  
  if (!context.restaurantId) {
    throw new Error('No restaurant selected. Please select a restaurant first.');
  }
  
  if (!context.isLoading && !context.hasAccessTo(context.restaurantId)) {
    throw new Error('You do not have access to this restaurant.');
  }
  
  return {
    ...context,
    restaurantId: context.restaurantId as string,
    activeRestaurant: context.activeRestaurant as Restaurant | null,
  };
};
