// Bitcoin/USD pricing utilities using Coinbase API

const SATS_PER_BTC = 100_000_000;
const CACHE_DURATION_MS = 60_000; // 60 seconds

interface CachedPrice {
  price: number;
  timestamp: number;
}

let cachedPrice: CachedPrice | null = null;

/**
 * Fetches current BTC/USD spot price from Coinbase API
 * Caches result for 60 seconds to avoid excessive API calls
 */
export async function fetchBtcPrice(): Promise<number> {
  // Return cached price if still valid
  if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_DURATION_MS) {
    return cachedPrice.price;
  }

  try {
    const response = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    if (!response.ok) {
      throw new Error('Failed to fetch BTC price');
    }
    
    const data = await response.json();
    const price = parseFloat(data.data.amount);
    
    // Cache the result
    cachedPrice = {
      price,
      timestamp: Date.now(),
    };
    
    return price;
  } catch (error) {
    // If we have a stale cached price, use it as fallback
    if (cachedPrice) {
      console.warn('Using stale BTC price due to API error:', error);
      return cachedPrice.price;
    }
    throw error;
  }
}

/**
 * Converts USD amount to satoshis based on current BTC price
 * @param usdAmount - Amount in USD (e.g., 10.00)
 * @param btcPriceUsd - Current BTC price in USD
 * @returns Amount in satoshis
 */
export function usdToSats(usdAmount: number, btcPriceUsd: number): number {
  if (btcPriceUsd <= 0) return 0;
  const btcAmount = usdAmount / btcPriceUsd;
  return Math.round(btcAmount * SATS_PER_BTC);
}

/**
 * Converts USD cents (database value) to display format
 * Database stores values like 1000 = $10.00
 * @param cents - Amount in cents (e.g., 1000)
 * @returns Formatted USD string (e.g., "$10.00")
 */
export function formatUSD(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Converts USD cents to dollars
 * @param cents - Amount in cents
 * @returns Amount in dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Converts dollars to cents for database storage
 * @param dollars - Amount in dollars
 * @returns Amount in cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Gets cache age in seconds
 */
export function getCacheAge(): number {
  if (!cachedPrice) return -1;
  return Math.floor((Date.now() - cachedPrice.timestamp) / 1000);
}

/**
 * Forces cache refresh on next fetch
 */
export function invalidatePriceCache(): void {
  cachedPrice = null;
}
