import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface FoodAccessGateProps {
  children: ReactNode;
}

export function FoodAccessGate({ children }: FoodAccessGateProps) {
  const { roles } = useAuth();
  const isAdmin = roles.includes("super_admin") || roles.includes("restaurant_admin");

  if (!isAdmin) {
    return <Navigate to="/cleaning" replace />;
  }

  return <>{children}</>;
}
