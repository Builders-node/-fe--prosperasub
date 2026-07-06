import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import type { RentalProvider } from "@/types/carRental";

const STORAGE_KEY = "rental_admin_provider";

export function useRentalProvider() {
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? "all",
  );

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["admin-rental-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_providers")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentalProvider[];
    },
  });

  const select = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedId(id);
  };

  useEffect(() => {
    if (
      selectedId !== "all" &&
      providers.length > 0 &&
      !providers.find((p) => p.id === selectedId)
    ) {
      select("all");
    }
  }, [providers, selectedId]);

  const selected = providers.find((p) => p.id === selectedId) ?? null;

  return { providers, selected, selectedId, select, isLoading };
}
