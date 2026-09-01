import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Send this page to someone.
 *
 * Uses the OS share sheet where there is one — on a phone that is what people
 * expect, and it reaches WhatsApp, which is how Próspera actually passes things
 * around. Everywhere else it copies the link and says so, because a button that
 * appears to do nothing is worse than one that does the humble thing.
 */
export function ShareButton({
  title,
  text,
  url,
  className,
}: {
  title: string;
  text?: string;
  /** Defaults to the page currently open. */
  url?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const link = url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!link) return;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: link });
        return;
      } catch (err) {
        // Dismissing the sheet is a choice, not a failure — don't fall through
        // to copying a link the person just decided not to send.
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <button
      type="button"
      aria-label={`Share ${title}`}
      onClick={share}
      className={cn(
        // No colour of its own: over a hero photo it must stay white, over a
        // card it must be foreground. The parent already knows which.
        "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-muted",
        className,
      )}
    >
      {copied ? <Check className="h-6 w-6 text-emerald-500" /> : <Share2 className="h-6 w-6" />}
    </button>
  );
}
