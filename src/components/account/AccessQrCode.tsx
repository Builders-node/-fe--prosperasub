import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck } from "lucide-react";
import { accountApi } from "@/integrations/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * A user's personal access QR code. The token is short-lived and signed by the
 * backend, so the QR auto-refreshes a little before it expires. Staff scan it to
 * verify the user's subscription access at /verify.
 */
export function AccessQrCode({ className }: { className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchToken = async () => {
      const { data, error: apiError } = await accountApi("/verify/token", { method: "POST" });
      if (cancelled) return;

      if (apiError || !data?.token) {
        setError(true);
        setLoading(false);
        return;
      }

      setError(false);
      setLoading(false);
      setUrl(`${window.location.origin}/verify?token=${encodeURIComponent(data.token)}`);

      // Refresh ~15s before expiry so the displayed QR is always valid.
      const refreshInMs = Math.max(((data.expires_in ?? 300) - 15) * 1000, 30_000);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fetchToken, refreshInMs);
    };

    fetchToken();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="flex h-[180px] w-[180px] items-center justify-center rounded-2xl bg-white p-3">
        {loading ? (
          <Spinner />
        ) : error ? (
          <p className="px-4 text-center text-[12px] text-muted-foreground">
            Could not load your access code
          </p>
        ) : (
          url && <QRCodeSVG value={url} size={154} level="M" />
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Show this to staff for access
      </p>
    </div>
  );
}
