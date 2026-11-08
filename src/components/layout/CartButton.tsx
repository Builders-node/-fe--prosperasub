import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { cn } from "@/lib/utils";
import { HeaderBadge } from "@/components/layout/HeaderBadge";
import { HEADER_ACTION_CLASS, HEADER_ACTION_ICON_CLASS } from "@/components/layout/headerAction";

export function CartButton({ className }: { className?: string }) {
  const { count } = useCart();
  return (
    <Link
      to="/cart"
      aria-label={`Cart${count ? ` (${count})` : ""}`}
      className={cn("relative", HEADER_ACTION_CLASS, className)}
    >
      <ShoppingCart className={HEADER_ACTION_ICON_CLASS} />
      <HeaderBadge count={count} />
    </Link>
  );
}
