import { ReactNode } from "react";

interface FoodAccessGateProps {
  children: ReactNode;
}

/** Food is now available to all users — gate removed. */
export function FoodAccessGate({ children }: FoodAccessGateProps) {
  return <>{children}</>;
}
