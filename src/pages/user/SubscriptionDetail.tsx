import { useState, useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar, MapPin, Utensils, Loader2, Clock, XCircle, Edit, Sun, Coffee, Moon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, differenceInHours, parseISO, isBefore, startOfDay } from "date-fns";
import { nowHN } from "@/lib/timezone";
import { UserLayout } from "@/components/layout/UserLayout";
import { DeliveryAddress, getAddressString, normalizeDeliveryAddress } from "@/types/delivery";

type MealChoice = "eat_in" | "delivery" | "cancelled";
type MealTypeSlot = "breakfast" | "lunch" | "dinner";

const mealTimeConfig: Record<MealTypeSlot, { icon: typeof Coffee; label: string; time: string }> = {
  breakfast: { icon: Coffee, label: "Breakfast", time: "08:00:00" },
  lunch: { icon: Sun, label: "Lunch", time: "13:00:00" },
  dinner: { icon: Moon, label: "Dinner", time: "19:00:00" },
};

const SubscriptionDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { userData, isLoading: authLoading, isAuthenticated, isUserDataReady, logout, lightningPubkey } = useAuth();
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const redirectUrl = `/login/lightning?redirect=${encodeURIComponent(location.pathname)}`;

  // Support both OAuth and Lightning auth
  const pubkey = userData?.lightning_pubkey || lightningPubkey || "";

  const {
    data: subscription,
    isLoading: subLoading,
    error: subError,
  } = useQuery({
    queryKey: ["subscription", id, userData?.id, pubkey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_subscription_detail_by_pubkey", {
        p_pubkey: pubkey,
        p_subscription_id: id,
      });
      
      if (error) {
        throw error;
      }
      
      // RPC returns an array, get first item
      const sub = Array.isArray(data) ? data[0] : data;
      if (!sub) {
        return null;
      }
      
      // Transform to expected shape
      return {
        ...sub,
        restaurants: {
          name: sub.restaurant_name,
          logo_url: sub.restaurant_logo_url,
          address: sub.restaurant_address,
        },
        subscription_plans: {
          name: sub.plan_name,
          meal_time: sub.plan_meal_time,
          supports_delivery: sub.plan_supports_delivery,
        },
      };
    },
    enabled: isUserDataReady && !!id && isAuthenticated,
    retry: 0,
  });

  const { data: mealChoices, isLoading: choicesLoading } = useQuery({
    queryKey: ["meal-choices", id, userData?.id, pubkey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_daily_meal_choices_by_pubkey", {
        p_pubkey: pubkey,
        p_subscription_id: id,
      });
      if (error) throw error;
      return data;
    },
    enabled: isUserDataReady && !!id && isAuthenticated,
  });

  const { data: globalSettings } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("global_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return null;
      const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", userData.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userData?.id,
  });

  const updateChoiceMutation = useMutation({
    mutationFn: async ({ choiceId, choice, deliveryAddress, notes }: {
      choiceId: string;
      choice: MealChoice;
      deliveryAddress?: any;
      notes?: string;
    }) => {
      const updateData: any = { choice };
      if (deliveryAddress !== undefined) {
        updateData.delivery_address = deliveryAddress;
      }
      if (notes !== undefined) {
        updateData.customer_notes = notes;
      }

      const { error } = await supabase.from("daily_meal_choices").update(updateData).eq("id", choiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meal choice updated!");
      queryClient.invalidateQueries({ queryKey: ["meal-choices", id] });
      setEditingMealId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateMealDetailsMutation = useMutation({
    mutationFn: async ({ choiceId, deliveryAddress, notes }: {
      choiceId: string;
      deliveryAddress?: string;
      notes?: string;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (deliveryAddress !== undefined) {
        // Use canonical DeliveryAddress shape
        const normalizedAddress: DeliveryAddress = { address: deliveryAddress };
        updateData.delivery_address = normalizedAddress;
      }
      if (notes !== undefined) {
        updateData.customer_notes = notes;
      }

      const { error } = await supabase.from("daily_meal_choices").update(updateData).eq("id", choiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Delivery details updated!");
      queryClient.invalidateQueries({ queryKey: ["meal-choices", id] });
      setEditingMealId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const isChoiceLocked = (date: string, mealType: MealTypeSlot) => {
    const cutoffHours = globalSettings?.daily_choice_cutoff_hours || 3;
    const mealTime = mealTimeConfig[mealType].time;
    const mealDateTime = new Date(`${date}T${mealTime}`);
    const cutoffTime = new Date(mealDateTime.getTime() - cutoffHours * 60 * 60 * 1000);
    return isBefore(cutoffTime, nowHN());
  };

  const getTimeUntilCutoff = (date: string, mealType: MealTypeSlot) => {
    const cutoffHours = globalSettings?.daily_choice_cutoff_hours || 3;
    const mealTime = mealTimeConfig[mealType].time;
    const mealDateTime = new Date(`${date}T${mealTime}`);
    const cutoffTime = new Date(mealDateTime.getTime() - cutoffHours * 60 * 60 * 1000);
    const hoursLeft = differenceInHours(cutoffTime, nowHN());

    if (hoursLeft <= 0) return null;
    if (hoursLeft < 24) return `${hoursLeft}h left`;
    return `${Math.floor(hoursLeft / 24)}d ${hoursLeft % 24}h`;
  };

  // Group meal choices by date
  const mealsByDate = useMemo(() => {
    if (!mealChoices) return {};
    return mealChoices.reduce((acc, choice) => {
      if (!acc[choice.date]) {
        acc[choice.date] = {} as Partial<Record<MealTypeSlot, typeof mealChoices[0]>>;
      }
      acc[choice.date][choice.meal_type as MealTypeSlot] = choice;
      return acc;
    }, {} as Record<string, Partial<Record<MealTypeSlot, typeof mealChoices[0]>>>);
  }, [mealChoices]);

  const sortedDates = useMemo(() => {
    return Object.keys(mealsByDate).sort();
  }, [mealsByDate]);

  const handleChoiceChange = (choiceId: string, choice: MealChoice) => {
    // If switching to delivery, use default address from profile
    if (choice === "delivery") {
      const defaultAddress = userProfile?.default_delivery_address;
      updateChoiceMutation.mutate({
        choiceId,
        choice,
        deliveryAddress: defaultAddress || null,
      });
    } else {
      updateChoiceMutation.mutate({ choiceId, choice });
    }
  };

  const openEditDialog = (meal: any) => {
    const mealAddress = normalizeDeliveryAddress(meal.delivery_address);
    const profileAddress = normalizeDeliveryAddress(userProfile?.default_delivery_address);
    setEditAddress(getAddressString(mealAddress) || getAddressString(profileAddress) || "");
    setEditNotes(meal.customer_notes || "");
    setEditingMealId(meal.id);
  };

  // Wait for auth to fully initialize before making any decisions
  if (authLoading || !isUserDataReady) {
    return (
      <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions">
        <div className="flex items-center justify-center py-space-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </UserLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions">
        <div className="flex items-center justify-center py-space-20">
          <Card className="p-space-8 text-center">
            <p className="mb-space-4">Please sign in to view subscriptions.</p>
            <Button asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          </Card>
        </div>
      </UserLayout>
    );
  }

  if (subLoading || choicesLoading) {
    return (
      <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions">
        <div className="flex items-center justify-center py-space-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </UserLayout>
    );
  }

  if (subError) {
    return (
      <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions">
        <div className="flex items-center justify-center py-space-20">
        <Card className="max-w-lg p-space-8 text-center">
          <p className="mb-space-2 text-panel-title">Couldn’t load this subscription.</p>
          <p className="type-body text-muted-foreground">{(subError as any)?.message || "Please try again."}</p>
          <Button asChild className="mt-space-4">
            <Link to="/my-subscriptions">Back to My Bookings</Link>
          </Button>
        </Card>
        </div>
      </UserLayout>
    );
  }

  if (!subscription) {
    return (
      <UserLayout title="Subscription" showBackButton backTo="/my-subscriptions">
        <div className="flex items-center justify-center py-space-20">
          <Card className="p-space-8 text-center">
            <p className="text-panel-title">Subscription not found</p>
            <Button asChild className="mt-space-4">
              <Link to="/my-subscriptions">Back to My Bookings</Link>
            </Button>
          </Card>
        </div>
      </UserLayout>
    );
  }

  const restaurant = subscription.restaurants as any;
  const plan = subscription.subscription_plans as any;

  return (
    <UserLayout title="Subscription Details" showBackButton backTo="/my-subscriptions">
      <div className="mx-auto w-full max-w-7xl px-space-4 py-space-6 sm:px-space-6 lg:px-space-10 lg:py-space-12">
        <header className="mb-space-6">
          <p className="text-caption uppercase tracking-[0.16em] text-primary">My Bookings</p>
          <h1 className="mt-space-2 type-page-title text-foreground">Meal subscription details</h1>
        </header>

        <div className="grid gap-space-5 md:gap-space-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-space-3">
                  {restaurant?.logo_url && (
                    <img
                      src={restaurant.logo_url}
                      alt={`${restaurant?.name || "Restaurant"} logo`}
                      className="w-12 h-12 rounded-radius-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div>
                    <div className="text-card-title">{restaurant?.name}</div>
                    <div className="type-body font-normal text-muted-foreground">{plan?.name}</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-space-3">
                <div className="flex items-center gap-space-2 text-control">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(parseISO(subscription.start_date), "MMM d")} - {format(parseISO(subscription.end_date), "MMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-space-2 text-control">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Meal time: {plan?.meal_time}</span>
                </div>
                <div className="flex items-center gap-space-2 text-control">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{restaurant?.address}</span>
                </div>
                <div className="pt-space-2">
                  <Badge variant={subscription.is_active ? "default" : "secondary"}>
                    {subscription.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant="outline" className="ml-2">
                    {subscription.payment_status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-space-4">
              <CardHeader>
                <CardTitle>How it works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-space-2 type-body text-muted-foreground">
                <p>Choose eat-in, delivery, or cancel for each meal.</p>
                <p>You can change your choice up to {globalSettings?.daily_choice_cutoff_hours || 3} hours before meal time.</p>
                <p>After cutoff, your choice is locked.</p>
                <p>For delivery, you can customize the address per meal.</p>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <h2 className="mb-space-4 text-section-title">Meal Calendar</h2>
            <div className="space-y-space-4">
              {sortedDates.map((dateStr) => {
                const dayMeals = mealsByDate[dateStr];
                const isPast = isBefore(parseISO(dateStr), startOfDay(nowHN()));
                const profileAddr = normalizeDeliveryAddress(userProfile?.default_delivery_address);

                return (
                  <Card key={dateStr} className={isPast ? "opacity-60" : ""}>
                    <CardHeader className="pb-space-2">
                      <CardTitle className="text-card-title">
                        {format(parseISO(dateStr), "EEEE, MMMM d")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-space-2">
                      {(["breakfast", "lunch", "dinner"] as MealTypeSlot[]).map((mealType) => {
                        const choice = dayMeals[mealType];
                        if (!choice) return null;

                        const MealIcon = mealTimeConfig[mealType].icon;
                        const locked = choice.locked || isChoiceLocked(dateStr, mealType);
                        const timeLeft = getTimeUntilCutoff(dateStr, mealType);
                        const choiceAddr = normalizeDeliveryAddress(choice.delivery_address);
                        const deliveryAddr = getAddressString(choiceAddr) || getAddressString(profileAddr);

                        return (
                          <div key={choice.id} className="flex flex-col gap-space-2 rounded-radius-lg bg-[hsl(var(--app-control))] p-space-3">
                            <div className="flex items-center justify-between gap-space-4">
                              <div className="flex items-center gap-space-2">
                                <MealIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="text-control">{mealTimeConfig[mealType].label}</span>
                                {timeLeft && !locked && (
                                  <span className="text-xs text-amber-600">({timeLeft})</span>
                                )}
                                {locked && (
                                  <span className="text-xs text-muted-foreground">(locked)</span>
                                )}
                              </div>

                              <div className="flex items-center gap-space-2">
                                {locked || isPast ? (
                                  <Badge variant={
                                    choice.choice === "cancelled" ? "destructive" :
                                    choice.choice === "delivery" ? "secondary" : "default"
                                  } className="text-xs">
                                    {choice.choice === "eat_in" && <><Utensils className="h-3 w-3 mr-1" /> Eat-in</>}
                                    {choice.choice === "delivery" && <><MapPin className="h-3 w-3 mr-1" /> Delivery</>}
                                    {choice.choice === "cancelled" && <><XCircle className="h-3 w-3 mr-1" /> Cancelled</>}
                                    {!choice.choice && "Not set"}
                                  </Badge>
                                ) : (
                                  <Select
                                    value={choice.choice || ""}
                                    onValueChange={(value) => handleChoiceChange(choice.id, value as MealChoice)}
                                    disabled={updateChoiceMutation.isPending}
                                  >
                                    <SelectTrigger inputSize="sm" className="w-[130px]">
                                      <SelectValue placeholder="Choose...">
                                        {choice.choice === "eat_in" && (
                                          <span className="flex items-center gap-space-2">
                                            <Utensils className="h-4 w-4" />
                                            Eat-in
                                          </span>
                                        )}
                                        {choice.choice === "delivery" && (
                                          <span className="flex items-center gap-space-2">
                                            <MapPin className="h-4 w-4" />
                                            Delivery
                                          </span>
                                        )}
                                        {choice.choice === "cancelled" && (
                                          <span className="flex items-center gap-space-2">
                                            <XCircle className="h-4 w-4" />
                                            Cancel
                                          </span>
                                        )}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="eat_in">
                                        <div className="flex items-center gap-space-2">
                                          <Utensils className="h-4 w-4" />
                                          Eat-in
                                        </div>
                                      </SelectItem>
                                      {plan?.supports_delivery && (
                                        <SelectItem value="delivery">
                                          <div className="flex items-center gap-space-2">
                                            <MapPin className="h-4 w-4" />
                                            Delivery
                                          </div>
                                        </SelectItem>
                                      )}
                                      <SelectItem value="cancelled">
                                        <div className="flex items-center gap-space-2">
                                          <XCircle className="h-4 w-4" />
                                          Cancel
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}

                                {choice.status && choice.status !== "pending" && (
                                  <Badge variant="outline" className="capitalize text-xs">
                                    {choice.status}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Delivery details section */}
                            {choice.choice === "delivery" && (
                              <div className="ml-6 rounded-radius-lg bg-background p-space-3 type-body">
                                <div className="flex items-start justify-between gap-space-2">
                                  <div className="flex items-start gap-space-2">
                                    <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                                    <div className="text-caption">
                                      <div>{deliveryAddr || "No address set"}</div>
                                      {choice.customer_notes && (
                                        <div className="text-muted-foreground">Note: {choice.customer_notes}</div>
                                      )}
                                    </div>
                                  </div>
                                  {!locked && !isPast && (
                                    <Dialog open={editingMealId === choice.id} onOpenChange={(open) => {
                                      if (open) openEditDialog(choice);
                                      else setEditingMealId(null);
                                    }}>
                                      <DialogTrigger asChild>
                                        <Button variant="tertiary" size="iconSm" aria-label="Edit delivery details">
                                          <Edit className="h-3 w-3" />
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent className="w-full sm:max-w-lg">
                                        <DialogHeader>
                                          <DialogTitle>Edit Delivery Details</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-space-4">
                                          <div>
                                            <Label>Delivery Address</Label>
                                            <Textarea
                                              value={editAddress}
                                              onChange={(e) => setEditAddress(e.target.value)}
                                              placeholder="Enter delivery address"
                                              rows={3}
                                            />
                                          </div>
                                          <div>
                                            <Label>Special Notes (optional)</Label>
                                            <Input
                                              value={editNotes}
                                              onChange={(e) => setEditNotes(e.target.value)}
                                              placeholder="e.g., no onions, extra spicy"
                                            />
                                          </div>
                                          <Button
                                            onClick={() => updateMealDetailsMutation.mutate({
                                              choiceId: choice.id,
                                              deliveryAddress: editAddress,
                                              notes: editNotes,
                                            })}
                                            loading={updateMealDetailsMutation.isPending}
                                            className="w-full"
                                          >
                                            Save Changes
                                          </Button>
                                        </div>
                                      </DialogContent>
                                    </Dialog>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}

              {sortedDates.length === 0 && (
                <Card className="p-space-8 text-center">
                  <p className="type-body text-muted-foreground">No meal days found for this subscription.</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default SubscriptionDetail;
