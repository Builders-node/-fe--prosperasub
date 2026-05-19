import { useQuery } from "@tanstack/react-query";
import { fetchBtcPrice, usdToSats, getCacheAge, invalidatePriceCache } from "@/lib/pricing";

/**
 * React Query hook for fetching and caching BTC/USD price
 * Auto-refreshes every 60 seconds
 */
export function useBtcPrice() {
  const query = useQuery({
    queryKey: ["btc-price"],
    queryFn: fetchBtcPrice,
    staleTime: 30_000, // Consider stale after 30 seconds
    refetchInterval: 60_000, // Refetch every 60 seconds
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const convertToSats = (usdAmount: number): number => {
    if (!query.data) return 0;
    return usdToSats(usdAmount, query.data);
  };

  const refreshPrice = async () => {
    invalidatePriceCache();
    await query.refetch();
  };

  return {
    btcPrice: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    cacheAge: getCacheAge(),
    convertToSats,
    refreshPrice,
    refetch: query.refetch,
  };
}
