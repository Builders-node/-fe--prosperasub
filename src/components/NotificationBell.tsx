import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

export function NotificationBell({ className }: { className?: string }) {
  const { isAuthenticated } = useAuth();
  const { data: count = 0 } = useUnreadCount();

  if (!isAuthenticated) return null;

  return (
    <Link
      to="/notifications"
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span
          className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground leading-none"
          aria-hidden
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
