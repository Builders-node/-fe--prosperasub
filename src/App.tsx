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
import Notifications from "./pages/user/Notifications";

// Discovery
import Discovery from "./pages/Discovery";

// Cleaning pages
import CleaningPackages from "./pages/cleaning/CleaningPackages";
import CleaningCheckout from "./pages/cleaning/CleaningCheckout";
import CleaningBook from "./pages/cleaning/CleaningBook";

// Car Rental pages
import CarRental from "./pages/cars/CarRental";
import CarDetail from "./pages/cars/CarDetail";
import CarBooking from "./pages/cars/CarBooking";

// Super Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import PlatformSettings from "./pages/admin/PlatformSettings";
import CleaningManagement from "./pages/admin/CleaningManagement";
import AdminPayments from "./pages/admin/Payments";
import AdminClients from "./pages/admin/Clients";
import AdminUsers from "./pages/admin/Users";
import CleaningPlans from "./pages/admin/CleaningPlans";
import AdminSubscriptions from "./pages/admin/Subscriptions";
import AuditLogs from "./pages/admin/AuditLogs";
import RoleManagement from "./pages/admin/RoleManagement";
import CarRentalsVehicles from "./pages/admin/CarRentalsVehicles";
import CarRentalsReservations from "./pages/admin/CarRentalsReservations";
import CarRentalsCustomers from "./pages/admin/CarRentalsCustomers";
import CarRentalsAnalytics from "./pages/admin/CarRentalsAnalytics";
import CarRentalsDelivery from "./pages/admin/CarRentalsDelivery";

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
              {/* Home → Discovery */}
              <Route path="/" element={<Navigate to="/discovery" replace />} />

              {/* Auth */}
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/auth" element={<OAuthCallback />} />
              <Route path="/forgot-password" element={<Navigate to="/discovery" replace />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Discovery */}
              <Route path="/discovery" element={<Discovery />} />

              {/* Cleaning */}
              <Route path="/cleaning" element={<CleaningPackages />} />
              <Route path="/cleaning/checkout/:packageId" element={
                <ProtectedRoute><CleaningCheckout /></ProtectedRoute>
              } />
              <Route path="/cleaning/book" element={
                <ProtectedRoute><CleaningBook /></ProtectedRoute>
              } />

              {/* Car Rental */}
              <Route path="/cars" element={<CarRental />} />
              <Route path="/cars/:id" element={<CarDetail />} />
              <Route path="/cars/:id/book" element={
                <ProtectedRoute><CarBooking /></ProtectedRoute>
              } />

              {/* User */}
              <Route path="/my-subscriptions" element={
                <ProtectedRoute><MySubscriptions /></ProtectedRoute>
              } />
              <Route path="/notifications" element={
                <ProtectedRoute><Notifications /></ProtectedRoute>
              } />
              <Route path="/account" element={<Navigate to="/my-subscriptions" replace />} />
              <Route path="/profile" element={<Navigate to="/discovery" replace />} />
              <Route path="/cleaning/my-bookings" element={<Navigate to="/my-subscriptions" replace />} />

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
              <Route path="/admin/cleaning-plans" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CleaningPlans /></ProtectedRoute>
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
              <Route path="/admin/subscriptions" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AdminSubscriptions /></ProtectedRoute>
              } />
              <Route path="/admin/roles" element={
                <ProtectedRoute allowedRoles={['super_admin']}><RoleManagement /></ProtectedRoute>
              } />
              <Route path="/admin/audit-logs" element={
                <ProtectedRoute allowedRoles={['super_admin']}><AuditLogs /></ProtectedRoute>
              } />
              <Route path="/admin/settings" element={
                <ProtectedRoute allowedRoles={['super_admin']}><PlatformSettings /></ProtectedRoute>
              } />
              {/* Admin Car Rentals */}
              <Route path="/admin/car-rentals" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsVehicles /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/reservations" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsReservations /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/customers" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsCustomers /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/analytics" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsAnalytics /></ProtectedRoute>
              } />
              <Route path="/admin/car-rentals/delivery" element={
                <ProtectedRoute allowedRoles={['super_admin']}><CarRentalsDelivery /></ProtectedRoute>
              } />
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
