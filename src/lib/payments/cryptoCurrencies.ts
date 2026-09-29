/**
 * Human names for gateway tickers.
 *
 * A ticker like `usdttrc20` is exact and unreadable; "USDT · Tron" is what the
 * customer's wallet calls it. The NETWORK matters as much as the coin — USDT
 * sent on Ethereum to a Tron address is gone — so it is always shown.
 *
 * Unknown tickers fall back to upper case: a coin switched on in the gateway
 * dashboard appears at the till without a code change, just less prettily.
 */
const KNOWN: Record<string, { coin: string; network?: string }> = {
  usdttrc20: { coin: "USDT", network: "Tron" },
  usdterc20: { coin: "USDT", network: "Ethereum" },
  usdtbsc:   { coin: "USDT", network: "BNB Chain" },
  usdtsol:   { coin: "USDT", network: "Solana" },
  usdtmatic: { coin: "USDT", network: "Polygon" },
  usdtton:   { coin: "USDT", network: "TON" },
  usdcsol:   { coin: "USDC", network: "Solana" },
  usdcbase:  { coin: "USDC", network: "Base" },
  usdcmatic: { coin: "USDC", network: "Polygon" },
  usdc:      { coin: "USDC", network: "Ethereum" },
  eth:       { coin: "ETH",  network: "Ethereum" },
  ethbase:   { coin: "ETH",  network: "Base" },
  sol:       { coin: "SOL",  network: "Solana" },
  ltc:       { coin: "LTC" },
  ton:       { coin: "TON" },
  trx:       { coin: "TRX",  network: "Tron" },
  bnbbsc:    { coin: "BNB",  network: "BNB Chain" },
  xrp:       { coin: "XRP" },
  doge:      { coin: "DOGE" },
  xmr:       { coin: "XMR" },
};

export function cryptoCurrencyLabel(code: string): { coin: string; network: string | null } {
  const k = KNOWN[code.toLowerCase()];
  return k ? { coin: k.coin, network: k.network ?? null } : { coin: code.toUpperCase(), network: null };
}

/** Stablecoins first (what most people will pay with), then the rest as the gateway listed them. */
export function sortCryptoCurrencies(codes: string[]): string[] {
  const stable = (c: string) => /^usd[tc]/i.test(c) ? 0 : 1;
  return [...codes].sort((a, b) => stable(a) - stable(b));
}
