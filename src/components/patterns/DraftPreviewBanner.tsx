import { EyeOff } from "lucide-react";

/** Shown above a page rendered with `?preview=1` (see hooks/useDraftPreview). */
export function DraftPreviewBanner() {
  return (
    <div className="flex items-center gap-2 rounded-radius-md bg-amber-500/15 px-4 py-3 text-sm text-foreground">
      <EyeOff className="h-4 w-4 shrink-0 text-amber-500" />
      <span>
        <b>Draft preview.</b> Customers can't see this yet, and it can't be bought. Switch it on in Admin → Marketplace to launch.
      </span>
    </div>
  );
}
