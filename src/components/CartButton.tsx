import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { cn } from "@/lib/utils";
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
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
