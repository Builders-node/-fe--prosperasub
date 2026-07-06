import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { FoodProvider } from "@/types/food";

const STORAGE_KEY = "food_admin_restaurant";

/**
 * Persists the selected restaurant across food admin pages via localStorage.
 * Returns the full list of restaurants plus the current selection.
 */
export function useFoodRestaurant() {
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? "all",
  );

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["admin-food-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("food_providers")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FoodProvider[];
    },
  });

  const select = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedId(id);
  };

  // If the saved ID no longer exists, fall back to "all"
  useEffect(() => {
    if (
      selectedId !== "all" &&
      restaurants.length > 0 &&
      !restaurants.find((r) => r.id === selectedId)
    ) {
      select("all");
    }
  }, [restaurants, selectedId]);

  const selected = restaurants.find((r) => r.id === selectedId) ?? null;

  return { restaurants, selected, selectedId, select, isLoading };
}
