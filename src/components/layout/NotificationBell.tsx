import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";

export function NotificationBell({ className }: { className?: string }) {
  const { isAuthenticated } = useAuth();
  const { data: count = 0 } = useUnreadCount();

  if (!isAuthenticated) return null;

  return (
    <Link
      to="/notifications"
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
      className={cn("relative", HEADER_ACTION_CLASS, className)}
    >
      <Bell className={HEADER_ACTION_ICON_CLASS} />
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
