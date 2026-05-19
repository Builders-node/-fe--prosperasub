import RestaurantAdminLayout from "@/components/restaurant/RestaurantAdminLayout";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Zap, Calendar, Phone, Send, User, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

const SubscribersPage = () => {
  const { restaurantId, activeRestaurant } = useRestaurant();
  const queryClient = useQueryClient();

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ["restaurant-subscriptions", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          *,
          subscription_plans (name, meal_time),
          users (id, display_name, name, email)
        `)
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  // Fetch user profiles for contact info
  const userIds = subscriptions?.map(s => s.user_id) || [];
  const { data: profiles } = useQuery({
    queryKey: ["subscriber-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, phone_number, telegram_username")
        .in("user_id", userIds);
      
      if (error) throw error;
      return data;
    },
    enabled: userIds.length > 0,
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ payment_status: "paid" })
        .eq("id", subscriptionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant-subscriptions"] });
      toast.success("Payment confirmed!");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ payment_status: "failed", is_active: false })
        .eq("id", subscriptionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant-subscriptions"] });
      toast.success("Subscription rejected");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const getProfileForUser = (userId: string) => {
    return profiles?.find(p => p.user_id === userId);
  };

  const getStatusVariant = (status: string | null) => {
    switch (status) {
      case "paid": return "default";
      case "pending": return "secondary";
      case "failed": return "destructive";
      default: return "outline";
    }
  };

  const pendingSubscriptions = subscriptions?.filter(s => s.payment_status === "pending" && s.is_active) || [];
  const activeSubscriptions = subscriptions?.filter(s => s.is_active && s.payment_status === "paid") || [];
  const inactiveSubscriptions = subscriptions?.filter(s => !s.is_active || s.payment_status === "failed") || [];

  const SubscriptionCard = ({ subscription, showActions = false }: { subscription: any; showActions?: boolean }) => {
    const profile = getProfileForUser(subscription.user_id);
    const user = subscription.users as any;
    
    return (
      <Card key={subscription.id} className={!subscription.is_active ? "opacity-75" : ""}>
        <CardHeader className="pb-space-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-space-3">
              <div className={`h-10 w-10 rounded-radius-full flex items-center justify-center ${
                subscription.is_active ? "bg-primary/10" : "bg-muted"
              }`}>
                <User className={`h-5 w-5 ${subscription.is_active ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {user?.display_name || user?.name || "Unknown User"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {(subscription.subscription_plans as any)?.name}
                </p>
              </div>
            </div>
            <Badge variant={getStatusVariant(subscription.payment_status)}>
              {subscription.payment_status || "unknown"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-space-4 text-sm">
            <div>
              <span className="text-muted-foreground flex items-center gap-space-1">
                <Calendar className="h-3 w-3" /> Duration
              </span>
              <div className="font-medium">
                {format(new Date(subscription.start_date), "MMM d")} - {format(new Date(subscription.end_date), "MMM d, yyyy")}
              </div>
              <div className="text-xs text-muted-foreground">
                {subscription.duration_weeks} week{subscription.duration_weeks > 1 ? "s" : ""}
              </div>
            </div>
            
            <div>
              <span className="text-muted-foreground">Payment</span>
              <div className="font-medium flex items-center gap-space-1">
                <Zap className="h-3 w-3 text-amber-500" />
                {subscription.total_price_sats.toLocaleString()} sats
              </div>
            </div>
            
            <div>
              <span className="text-muted-foreground flex items-center gap-space-1">
                <Phone className="h-3 w-3" /> Phone
              </span>
              <div className="font-medium">
                {profile?.phone_number || "Not provided"}
              </div>
            </div>
            
            <div>
              <span className="text-muted-foreground flex items-center gap-space-1">
                <Send className="h-3 w-3" /> Telegram
              </span>
              <div className="font-medium">
                {profile?.telegram_username || "Not provided"}
              </div>
            </div>
          </div>
          
          {showActions && (
            <div className="flex gap-space-2 mt-space-4 pt-space-4 border-t">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => confirmPaymentMutation.mutate(subscription.id)}
                loading={confirmPaymentMutation.isPending}
              >
                {!confirmPaymentMutation.isPending && <CheckCircle2 className="h-4 w-4" />}
                Confirm Payment
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                onClick={() => rejectPaymentMutation.mutate(subscription.id)}
                loading={rejectPaymentMutation.isPending}
              >
                {!rejectPaymentMutation.isPending && <XCircle className="h-4 w-4" />}
                Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <RestaurantAdminLayout 
      title="Subscribers"
      subtitle={activeRestaurant?.name}
    >
      <div className="mb-space-6">
        <p className="text-muted-foreground">
          {pendingSubscriptions.length > 0 && (
            <span className="text-amber-500 font-medium">{pendingSubscriptions.length} pending verification, </span>
          )}
          {activeSubscriptions.length} active, {inactiveSubscriptions.length} inactive
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-space-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : subscriptions?.length === 0 ? (
        <Card className="p-space-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-space-4" />
          <p className="text-muted-foreground mb-space-2">No subscribers yet</p>
          <p className="text-sm text-muted-foreground">
            Once customers subscribe to your meal plans, they'll appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-space-8">
          {pendingSubscriptions.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-space-4 flex items-center gap-space-2">
                <Badge variant="secondary" className="h-6 bg-amber-500/20 text-amber-600 border-amber-500/30">
                  Pending Verification
                </Badge>
                <span className="text-muted-foreground text-sm font-normal">
                  ({pendingSubscriptions.length})
                </span>
              </h2>
              <p className="text-sm text-muted-foreground mb-space-4">
                These customers claim to have paid via Lightning Address. Please verify payment in your wallet before confirming.
              </p>
              <div className="grid gap-space-4">
                {pendingSubscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} showActions />
                ))}
              </div>
            </div>
          )}

          {activeSubscriptions.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-space-4 flex items-center gap-space-2">
                <Badge variant="default" className="h-6">Active</Badge>
                <span className="text-muted-foreground text-sm font-normal">
                  ({activeSubscriptions.length})
                </span>
              </h2>
              <div className="grid gap-space-4">
                {activeSubscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} />
                ))}
              </div>
            </div>
          )}

          {inactiveSubscriptions.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-space-4 flex items-center gap-space-2">
                <Badge variant="secondary" className="h-6">Inactive / Past</Badge>
                <span className="text-muted-foreground text-sm font-normal">
                  ({inactiveSubscriptions.length})
                </span>
              </h2>
              <div className="grid gap-space-4">
                {inactiveSubscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </RestaurantAdminLayout>
  );
};

export default SubscribersPage;
