import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DayOfWeek = Database["public"]["Enums"]["day_of_week"];
type MenuStatus = Database["public"]["Enums"]["menu_status"];
type MealTypeSlot = "breakfast" | "lunch" | "dinner";
type MenuCategory = "standard" | "vegetarian" | "vegan" | "keto" | "gluten_free" | "lactose_free";

export type { MenuCategory };

/**
 * Gets the current session credentials from localStorage.
 */
export const getSessionCredentials = (): {
  lightningPubkey?: string;
} => {
  return {
    lightningPubkey: localStorage.getItem("lightning_pubkey") || undefined,
  };
};

/**
 * Ensures lightning session is set for RLS policies
 */
const ensureLightningSession = async (): Promise<void> => {
  const pubkey = localStorage.getItem("lightning_pubkey");
  if (pubkey) {
    await supabase.rpc('set_lightning_session', { p_pubkey: pubkey });
  }
};

/**
 * Get weekly menus for the current user's restaurant using RPC to bypass RLS
 */
export const getWeeklyMenus = async (
  weekStart: string,
  weekEnd: string,
  restaurantId: string
): Promise<{ data: any[] | null; error: Error | null }> => {
  const pubkey = localStorage.getItem("lightning_pubkey") || "";
  
  const { data, error } = await supabase.rpc('get_weekly_menus_by_restaurant', {
    p_pubkey: pubkey,
    p_restaurant_id: restaurantId,
    p_week_start: weekStart,
    p_week_end: weekEnd,
  });
  
  // Transform the data to match the expected format (menu_items as array)
  const transformedData = data?.map((menu: any) => ({
    ...menu,
    menu_items: menu.menu_items || [],
  })) || null;
  
  return { data: transformedData, error: error as Error | null };
};

/**
 * Create a weekly menu for the current user's restaurant using RPC
 * Supports both Lightning auth (pubkey) and Supabase Auth (auth.uid())
 */
export const createWeeklyMenu = async (
  weekStartDate: string,
  weekEndDate: string,
  restaurantId: string,
  category: MenuCategory = "standard"
): Promise<{ data: any; error: Error | null }> => {
  // Get pubkey if available (for Lightning users), otherwise pass empty string
  // The RPC function will use auth.uid() if pubkey lookup fails
  const pubkey = localStorage.getItem("lightning_pubkey") || "";
  
  const { data, error } = await supabase.rpc('create_weekly_menu_by_pubkey', {
    p_pubkey: pubkey,
    p_restaurant_id: restaurantId,
    p_week_start_date: weekStartDate,
    p_week_end_date: weekEndDate,
    p_category: category,
  });
  
  return { data: data?.[0] || null, error: error as Error | null };
};

/**
 * Create a menu item for the current user's restaurant using RPC
 */
export const createMenuItem = async (
  weeklyMenuId: string,
  restaurantId: string,
  dayOfWeek: DayOfWeek,
  mealType: MealTypeSlot,
  name: string,
  description?: string | null,
  tags?: string[],
  imageUrl?: string | null
): Promise<{ data: any; error: Error | null }> => {
  // Allow empty pubkey for OAuth users - RPC will use auth.uid() instead
  const pubkey = localStorage.getItem("lightning_pubkey") || "";
  
  const { data, error } = await supabase.rpc('create_menu_item_by_pubkey', {
    p_pubkey: pubkey,
    p_weekly_menu_id: weeklyMenuId,
    p_restaurant_id: restaurantId,
    p_day_of_week: dayOfWeek,
    p_meal_type: mealType,
    p_name: name,
    p_description: description || undefined,
    p_tags: tags || [],
    p_image_url: imageUrl || undefined,
  });
  
  return { data: data?.[0] || null, error: error as Error | null };
};

/**
 * Update a menu item using RPC
 */
export const updateMenuItem = async (
  itemId: string,
  name: string,
  description?: string | null,
  tags?: string[],
  imageUrl?: string | null
): Promise<{ success: boolean; error: Error | null }> => {
  // Allow empty pubkey for OAuth users - RPC will use auth.uid() instead
  const pubkey = localStorage.getItem("lightning_pubkey") || "";
  
  const { data, error } = await supabase.rpc('update_menu_item_by_pubkey', {
    p_pubkey: pubkey,
    p_item_id: itemId,
    p_name: name,
    p_description: description || undefined,
    p_tags: tags || [],
    p_image_url: imageUrl || undefined,
  });
  
  return { success: !!data && !error, error: error as Error | null };
};

/**
 * Delete a menu item using RPC
 */
export const deleteMenuItem = async (
  itemId: string
): Promise<{ success: boolean; error: Error | null }> => {
  // Allow empty pubkey for OAuth users - RPC will use auth.uid() instead
  const pubkey = localStorage.getItem("lightning_pubkey") || "";
  
  const { data, error } = await supabase.rpc('delete_menu_item_by_pubkey', {
    p_pubkey: pubkey,
    p_item_id: itemId,
  });
  
  return { success: !!data && !error, error: error as Error | null };
};

/**
 * Update menu status using RPC (supports both Lightning and OAuth users)
 */
export const updateMenuStatus = async (
  menuId: string,
  status: MenuStatus
): Promise<{ success: boolean; error: Error | null }> => {
  // Allow empty pubkey for OAuth users - RPC will use auth.uid() instead
  const pubkey = localStorage.getItem("lightning_pubkey") || "";
  
  const { data, error } = await supabase.rpc('update_menu_status_by_pubkey', {
    p_pubkey: pubkey,
    p_menu_id: menuId,
    p_status: status,
  });
  
  return { success: !!data && !error, error: error as Error | null };
};