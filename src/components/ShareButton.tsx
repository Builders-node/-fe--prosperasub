import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Send this page to someone.
 *
 * Sharing a link looks like one API call and is really four, because every
 * step of it is something a browser is allowed to refuse:
 *
 *  1. `navigator.share` — the OS sheet. Absent on most desktops, and on iOS it
 *     only exists in Safari proper, not in every in-app browser.
 *  2. `navigator.clipboard.writeText` — undefined outside a secure context and
 *     in some in-app browsers, and it throws NotAllowedError when the document
 *     is not focused, which is easy to hit on desktop.
 *  3. `document.execCommand("copy")` — deprecated, and the reason this still
 *     works where the modern one does not.
 *  4. Showing the link, so a refusal at every level still leaves the person
 *     able to copy it by hand.
 *
 * The first version stopped at 2 and told people "Couldn't copy the link",
 * which is a dead end dressed as an error message.
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

  const flashCopied = () => {
    setCopied(true);
    toast.success("Link copied");
    window.setTimeout(() => setCopied(false), 2000);
  };

  /**
   * The pre-Clipboard-API way. A textarea off-screen, selected and copied
   * synchronously — no permission, no promise, no secure context needed.
   */
  const copyByExecCommand = (value: string): boolean => {
    try {
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      // Off-screen but focusable; `display:none` cannot be selected.
      el.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
      document.body.appendChild(el);
      el.select();
      el.setSelectionRange(0, value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

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
      // Optional chaining on purpose: the object itself is missing in plenty of
      // contexts, and a TypeError here reads identically to a refusal.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        flashCopied();
        return;
      }
    } catch (err) {
      console.warn("[share] clipboard API refused, falling back", err);
    }

    if (copyByExecCommand(link)) {
      flashCopied();
      return;
    }

    // Everything refused. Show the link rather than only the failure — the
    // person can still select it and send it themselves.
    toast.error("Couldn't copy automatically", {
      description: link,
      duration: 12000,
    });
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
