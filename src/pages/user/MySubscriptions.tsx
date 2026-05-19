import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, HelpCircle, CalendarDays, Clock, X, SparklesIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MySubscriptionCard } from "@/components/MySubscriptionCard";
import { HowItWorksSheet } from "@/components/HowItWorksSheet";
import { MealDeadlineBanner } from "@/components/CutoffIndicator";
import { startOfDay, addDays, format, isPast } from "date-fns";
import { UserLayout } from "@/components/layout/UserLayout";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";

const MySubscriptions = () => {
  const { userData, isAuthenticated, lightningPubkey, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ['user-subscriptions', userData?.id, lightningPubkey],
    queryFn: async () => {
      const pubkey = userData?.lightning_pubkey || lightningPubkey;
      if (pubkey) {
        await supabase.rpc("set_lightning_session", { p_pubkey: pubkey });
      }
      
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, restaurants(name, logo_url), subscription_plans(name, meal_time)')
        .eq('user_id', userData?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated && !!userData?.id,
  });

  const { data: cleaningSubscriptions, isLoading: cleaningSubsLoading } = useQuery({
    queryKey: ["my-cleaning-subscriptions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_subscriptions")
        .select("*, cleaning_packages(name, cleanings_per_month)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated,
  });

  const { data: cleaningBookings, isLoading: cleaningBookingsLoading } = useQuery({
    queryKey: ["my-cleaning-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cleaning_bookings")
        .select("*, cleaning_available_slots(date, start_time, end_time)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAuthenticated,
  });

  const cancelCleaningMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc("cancel_cleaning_booking", {
        p_booking_id: bookingId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Booking cancelled. Cleaning credit restored.");
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my-cleaning-subscriptions-all"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const { data: globalSettings } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("global_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: nextMeals } = useQuery({
    queryKey: ['next-meals', userData?.id, lightningPubkey],
    queryFn: async () => {
      if (!subscriptions?.length) return {};
      
      const pubkey = userData?.lightning_pubkey || lightningPubkey;
      const tomorrow = format(addDays(startOfDay(new Date()), 1), 'yyyy-MM-dd');
      
      const nextMealsMap: Record<string, any> = {};
      
      for (const sub of subscriptions) {
        if (!sub.is_active) continue;
        
        const { data } = await supabase.rpc("get_daily_meal_choices_by_pubkey", {
          p_pubkey: pubkey,
          p_subscription_id: sub.id,
        });
        
        if (data?.length) {
          const upcomingMeals = data
            .filter((m: any) => m.date >= tomorrow)
            .sort((a: any, b: any) => a.date.localeCompare(b.date));
          
          if (upcomingMeals.length > 0) {
            const nextMeal = upcomingMeals[0];
            nextMealsMap[sub.id] = {
              date: nextMeal.date,
              choice: nextMeal.choice,
              mealType: nextMeal.meal_type,
            };
          }
        }
      }
      
      return nextMealsMap;
    },
    enabled: !!subscriptions?.length,
  });

  if (authLoading) {
    return (
      <UserLayout title="My Bookings">
        <div className="flex items-center justify-center py-space-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </UserLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <UserLayout title="My Bookings">
        <div className="flex items-center justify-center py-space-20">
          <EmptyState
            title="Sign in to view subscriptions"
            description="Track your meal plans and daily choices."
            className="max-w-sm mx-space-4"
            action={
              <Button asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
            }
          />
        </div>
      </UserLayout>
    );
  }

  const activeSubscriptions = subscriptions?.filter(s => s.is_active) || [];
  const pastSubscriptions = subscriptions?.filter(s => !s.is_active) || [];
  const activeCleaningSubscriptions = cleaningSubscriptions?.filter((s) => s.is_active) || [];
  const upcomingCleaningBookings = cleaningBookings?.filter(
    (b) => b.status === "booked" && !isPast(new Date((b as any).cleaning_available_slots?.date + "T23:59:59"))
  ) || [];
  const pastCleaningBookings = cleaningBookings?.filter(
    (b) => b.status !== "booked" || isPast(new Date((b as any).cleaning_available_slots?.date + "T23:59:59"))
  ) || [];

  const cleaningStatusColor = (status: string) => {
    switch (status) {
      case "booked": return "default";
      case "completed": return "secondary";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  return (
    <UserLayout title="My Bookings">
      <div className="mx-auto w-full max-w-6xl space-y-space-8 px-space-5 py-space-8 sm:px-space-8 lg:px-space-10 lg:py-space-12">
        {/* Header */}
        <div className="flex items-start justify-between gap-space-5">
          <div>
            <p className="text-caption uppercase tracking-[0.16em] text-primary">Account</p>
            <h1 className="mt-space-2 type-page-title text-foreground">My Bookings</h1>
            <p className="mt-space-3 max-w-2xl type-body-large text-muted-foreground">
              Track meal subscriptions, cleaning bookings, and service changes.
            </p>
          </div>
          <HowItWorksSheet 
            trigger={
              <Button variant="secondary" size="icon" aria-label="How it works">
                <HelpCircle className="h-5 w-5" />
              </Button>
            }
          />
        </div>

        <div className="space-y-space-10">
          <section className="space-y-space-5">
            <div>
              <h2 className="text-section-title">Meal Plan</h2>
              <p className="mt-space-2 type-body text-muted-foreground">
                Manage active and past meal subscriptions.
              </p>
            </div>

            {globalSettings && activeSubscriptions.length > 0 && (
              <MealDeadlineBanner 
                cutoffHours={globalSettings.daily_choice_cutoff_hours || 3}
                mealTime="all"
              />
            )}

            <Button asChild className="w-full" variant="secondary" size="xl">
              <Link to="/restaurants">
                <Plus className="h-4 w-4" />
                Browse Plans & Subscribe
              </Link>
            </Button>

            {subsLoading ? (
              <div className="space-y-space-4">
                {[1, 2].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-space-4">
                      <div className="flex gap-space-4">
                        <div className="w-16 h-16 rounded-radius-lg bg-muted" />
                        <div className="flex-1 space-y-space-2">
                          <div className="h-4 w-32 bg-muted rounded" />
                          <div className="h-3 w-24 bg-muted rounded" />
                          <div className="h-3 w-40 bg-muted rounded" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : subscriptions?.length === 0 ? (
              <EmptyState
                title="No meal subscriptions yet"
                description="Subscribe to a meal plan and never worry about what to eat."
                action={
                  <Button asChild>
                    <Link to="/restaurants">Browse Restaurants</Link>
                  </Button>
                }
              />
            ) : (
              <>
                {activeSubscriptions.length > 0 && (
                  <section>
                    <h2 className="mb-space-3 text-caption uppercase tracking-[0.14em] text-muted-foreground">
                      Active ({activeSubscriptions.length})
                    </h2>
                    <div className="space-y-space-3">
                      {activeSubscriptions.map((sub: any) => (
                        <MySubscriptionCard 
                          key={sub.id} 
                          subscription={sub}
                          nextMeal={nextMeals?.[sub.id]}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {pastSubscriptions.length > 0 && (
                  <section>
                    <h2 className="mb-space-3 text-caption uppercase tracking-[0.14em] text-muted-foreground">
                      Past ({pastSubscriptions.length})
                    </h2>
                    <div className="space-y-space-3">
                      {pastSubscriptions.map((sub: any) => (
                        <MySubscriptionCard 
                          key={sub.id} 
                          subscription={sub}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </section>

          <section className="space-y-space-5">
            <div>
              <h2 className="text-section-title">Cleaning</h2>
              <p className="mt-space-2 type-body text-muted-foreground">
                Manage cleaning plans, upcoming bookings, and service history.
              </p>
            </div>

            <div className="grid gap-space-3">
              <Button asChild variant="secondary" size="xl">
                <Link to="/cleaning">
                  <SparklesIcon className="h-4 w-4" />
                  Browse Cleaning Plans
                </Link>
              </Button>
              <Button
                variant="primary"
                size="xl"
                onClick={() => navigate("/cleaning/book")}
                disabled={activeCleaningSubscriptions.length === 0}
              >
                <CalendarDays className="h-4 w-4" />
                Book Cleaning
              </Button>
            </div>

            {cleaningSubsLoading || cleaningBookingsLoading ? (
              <div className="space-y-space-4">
                {[1, 2].map(i => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-space-4">
                      <div className="h-5 w-40 rounded bg-muted" />
                      <div className="mt-space-3 h-4 w-64 rounded bg-muted" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                {activeCleaningSubscriptions.length > 0 ? (
                  <section className="space-y-space-3">
                    <h2 className="text-caption uppercase tracking-[0.14em] text-muted-foreground">
                      Active Cleaning Plans ({activeCleaningSubscriptions.length})
                    </h2>
                    {activeCleaningSubscriptions.map((sub) => (
                      <Card key={sub.id} className="bg-primary/5">
                        <CardContent className="flex items-center justify-between gap-space-4 pt-space-4">
                          <div>
                            <p className="text-card-title">{(sub as any).cleaning_packages?.name}</p>
                            <p className="type-body text-muted-foreground">
                              {sub.cleanings_remaining} cleanings remaining
                            </p>
                          </div>
                          <Button size="sm" onClick={() => navigate("/cleaning/book")}>
                            Book Now
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </section>
                ) : (
                  <EmptyState
                    title="No active cleaning subscription"
                    description="Choose a cleaning plan before booking your weekly service."
                    action={
                      <Button asChild>
                        <Link to="/cleaning">View Cleaning Plans</Link>
                      </Button>
                    }
                  />
                )}

                <section>
                  <h2 className="mb-space-3 text-caption uppercase tracking-[0.14em] text-muted-foreground">
                    Upcoming Cleanings ({upcomingCleaningBookings.length})
                  </h2>
                  {upcomingCleaningBookings.length === 0 ? (
                    <Card>
                      <CardContent className="py-space-6 text-center type-body text-muted-foreground">
                        No upcoming cleaning bookings
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-space-3">
                      {upcomingCleaningBookings.map((booking) => {
                        const slot = (booking as any).cleaning_available_slots;
                        return (
                          <Card key={booking.id}>
                            <CardContent className="flex items-center justify-between gap-space-4 pt-space-4">
                              <div className="flex items-center gap-space-3">
                                <div className="rounded-radius-md bg-primary/10 p-space-2">
                                  <CalendarDays className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <p className="text-card-title">
                                    {slot?.date ? format(new Date(slot.date + "T00:00:00"), "EEE, MMM d") : "—"}
                                  </p>
                                  <p className="flex items-center gap-space-1 type-body text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {slot?.start_time?.slice(0, 5)} - {slot?.end_time?.slice(0, 5)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="tertiary"
                                size="icon"
                                className="text-destructive"
                                onClick={() => cancelCleaningMutation.mutate(booking.id)}
                                disabled={cancelCleaningMutation.isPending}
                                aria-label="Cancel cleaning booking"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </section>

                {pastCleaningBookings.length > 0 && (
                  <section>
                    <h2 className="mb-space-3 text-caption uppercase tracking-[0.14em] text-muted-foreground">
                      Cleaning History ({pastCleaningBookings.length})
                    </h2>
                    <div className="space-y-space-2">
                      {pastCleaningBookings.map((booking) => {
                        const slot = (booking as any).cleaning_available_slots;
                        return (
                          <Card key={booking.id} className="opacity-70">
                            <CardContent className="flex items-center justify-between gap-space-4 pt-space-4">
                              <div>
                                <p className="type-body">
                                  {slot?.date ? format(new Date(slot.date + "T00:00:00"), "MMM d, yyyy") : "—"}
                                </p>
                                <p className="text-caption text-muted-foreground">
                                  {slot?.start_time?.slice(0, 5)} - {slot?.end_time?.slice(0, 5)}
                                </p>
                              </div>
                              <Badge variant={cleaningStatusColor(booking.status) as any}>{booking.status}</Badge>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </UserLayout>
  );
};

export default MySubscriptions;
