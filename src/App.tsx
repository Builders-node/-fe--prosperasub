import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { UserModeProvider } from "@/contexts/UserModeContext";
import { LanguageProvider } from "@/i18n";
import ProtectedRoute from "@/components/ProtectedRoute";

// Auth pages
import OAuthCallback from "./pages/OAuthCallback";
import ResetPassword from "./pages/ResetPassword";

// User pages
import MySubscriptions from "./pages/user/MySubscriptions";

// Cleaning pages
import CleaningPackages from "./pages/cleaning/CleaningPackages";
import CleaningCheckout from "./pages/cleaning/CleaningCheckout";
import CleaningBook from "./pages/cleaning/CleaningBook";

// Super Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import PlatformSettings from "./pages/admin/PlatformSettings";
import CleaningManagement from "./pages/admin/CleaningManagement";
import AdminPayments from "./pages/admin/Payments";
import AdminClients from "./pages/admin/Clients";
import AdminUsers from "./pages/admin/Users";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <LanguageProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AuthModalProvider>
                <UserModeProvider>
                <Routes>
              {/* Home → Cleaning */}
              <Route path="/" element={<Navigate to="/cleaning" replace />} />

              {/* Auth */}
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/auth" element={<OAuthCallback />} />
              <Route path="/forgot-password" element={<Navigate to="/cleaning" replace />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Cleaning */}
              <Route path="/cleaning" element={<CleaningPackages />} />
              <Route path="/cleaning/checkout/:packageId" element={
                <ProtectedRoute><CleaningCheckout /></ProtectedRoute>
              } />
              <Route path="/cleaning/book" element={
                <ProtectedRoute><CleaningBook /></ProtectedRoute>
              } />

              {/* User */}
              <Route path="/my-subscriptions" element={
                <ProtectedRoute><MySubscriptions /></ProtectedRoute>
              } />
              <Route path="/account" element={<Navigate to="/my-subscriptions" replace />} />
              <Route path="/profile" element={<Navigate to="/cleaning" replace />} />
              <Route path="/cleaning/my-bookings" element={<Navigate to="/my-subscriptions" replace />} />

              {/* Legacy food routes → redirect */}
              <Route path="/restaurants" element={<Navigate to="/cleaning" replace />} />
              <Route path="/restaurants/:id" element={<Navigate to="/cleaning" replace />} />
              <Route path="/plan/:planId" element={<Navigate to="/cleaning" replace />} />
              <Route path="/subscription/:id" element={<Navigate to="/my-subscriptions" replace />} />
              <Route path="/checkout/*" element={<Navigate to="/cleaning" replace />} />
              <Route path="/favorites" element={<Navigate to="/cleaning" replace />} />
              <Route path="/restaurant/*" element={<Navigate to="/admin/dashboard" replace />} />

              {/* Super Admin */}
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['super_admin']}><Navigate to="/admin/dashboard" replace /></ProtectedRoute>
              } />
              <Route path="/dashboard" element={
                <ProtectedRoute allowedRoles={['super_admin']}><Navigate to="/admin/dashboard" replace /></ProtectedRoute>
              } />
              <Route path="/admin/dashboard" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminDashboard /></ProtectedRoute>
              } />
              <Route path="/admin/cleaning" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CleaningManagement /></ProtectedRoute>
              } />
              <Route path="/admin/users" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminUsers /></ProtectedRoute>
              } />
              <Route path="/admin/clients" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminClients /></ProtectedRoute>
              } />
              <Route path="/admin/payments" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminPayments /></ProtectedRoute>
              } />
              <Route path="/admin/settings" element={
                <ProtectedRoute allowedRoles={['super_admin']}><PlatformSettings /></ProtectedRoute>
              } />
              {/* Legacy admin food routes → redirect */}
              <Route path="/admin/restaurants" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/subscriptions" element={<Navigate to="/admin/dashboard" replace />} />

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
                </Routes>
                </UserModeProvider>
                </AuthModalProvider>
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
