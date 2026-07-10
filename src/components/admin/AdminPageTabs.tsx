import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AdminPageTab {
  label: string;
  to: string;
  /** Optional badge (e.g. pending count). Hidden when 0/undefined. */
  badge?: number | null;
}

/**
 * A small pill tab-strip used at the top of admin pages that logically belong
 * together but live at different routes (Providers ↔ Applications; Users ↔
 * Clients). Keeps the sidebar compact — related concerns collapse into one
 * page group with tabs, not separate nav entries.
 */
export function AdminPageTabs({ tabs }: { tabs: AdminPageTab[] }) {
  const { pathname } = useLocation();
  return (
    <div className="mb-4 inline-flex gap-1 rounded-full bg-muted/50 p-1">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <Badge className={cn("h-5 min-w-[20px] rounded-full px-1.5 text-[10px]", active ? "bg-background/20 text-background" : "bg-primary/15 text-primary")}>
                {t.badge}
              </Badge>
            )}
          </Link>
        );
      })}
    </div>
  );
}
