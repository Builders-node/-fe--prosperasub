import { ADD_TO_CART } from "@/lib/checkout/ctaLabel";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import type { CartItem } from "@/lib/cart/cartItem";
import { cn } from "@/lib/utils";

/**
 * "Add to cart", on every service that has a cart line.
 *
 * Sits beside the pay button rather than replacing it: someone buying one
 * thing should not be made to visit a basket, and someone buying three should
 * not have to pay three times. The button confirms on itself as well as in a
 * toast — a toast at the top of a long checkout is easy to miss on a phone.
 */
export function AddToCartButton({
  line,
  qty = 1,
  className,
  disabled,
  label = ADD_TO_CART,
}: {
  line: Omit<CartItem, "key" | "qty">;
  qty?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
}) {
  const { addItem, has } = useCart();
  const navigate = useNavigate();
  const [justAdded, setJustAdded] = useState(false);
  const inCart = has(line.planId);

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={disabled}
      className={cn("h-12 rounded-2xl font-bold", className)}
      onClick={() => {
        if (inCart) { navigate("/cart"); return; }
        addItem(line, qty);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2000);
        toast.success("Added to cart", {
          action: { label: "View cart", onClick: () => navigate("/cart") },
        });
      }}
    >
      {justAdded || inCart ? (
        <><Check className="mr-2 h-4 w-4" /> {inCart ? "In your cart" : "Added"}</>
      ) : (
        <><ShoppingCart className="mr-2 h-4 w-4" /> {label}</>
      )}
    </Button>
  );
}
