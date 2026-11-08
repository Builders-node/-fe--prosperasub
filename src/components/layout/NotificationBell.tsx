import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { HeaderBadge } from "@/components/layout/HeaderBadge";
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
      <HeaderBadge count={count} />
    </Link>
  );
}
