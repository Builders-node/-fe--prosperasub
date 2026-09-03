/**
 * Where this app talks to.
 *
 * Split out of client.ts so the session layer can have the API's address
 * without importing the 1,500-line Supabase wrapper that sits below it — the
 * two were only ever in one file because everything was.
 */
const resolveApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  const fallbackUrl = "http://127.0.0.1:8082";

  if (configuredUrl && !configuredUrl.includes("127.0.0.1") && !configuredUrl.includes("localhost")) {
    return configuredUrl;
  }

  if (typeof window !== "undefined") {
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!isLocalHost) {
      return "https://api.prosperasub.com";
    }
  }

  return configuredUrl || fallbackUrl;
};

export const API_URL = resolveApiUrl();

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://igbytraidldkhhamsfdo.supabase.co";

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYnl0cmFpZGxka2hoYW1zZmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQxMzEsImV4cCI6MjA5NTU3MDEzMX0.VbaT7LMvtwswdfyDZI1rWkZtKSC0ICBDHeVbO4hLJeI";


