import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, Store, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DesktopHeader } from "@/components/layout/DesktopHeader";

const RestaurantList = () => {
  const { userData, refreshUserData } = useAuth();
  const { restaurants, isLoading } = useRestaurant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");

  const createRestaurantMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Restaurant name is required");
      if (!userData?.id) throw new Error("Not authenticated");
      
      const { data: restaurant, error: restaurantError } = await supabase
        .from("restaurants")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          address: address.trim() || null,
          is_active: true,
          created_by: userData.id,
        })
        .select()
        .single();
      
      if (restaurantError) throw restaurantError;
      
      // Add user to restaurant_admins junction table as owner
      const { error: adminError } = await supabase
        .from("restaurant_admins")
        .insert({
          user_id: userData.id,
          restaurant_id: restaurant.id,
          is_owner: true,
        });
      if (adminError) throw adminError;
      
      return restaurant;
    },
    onSuccess: (restaurant) => {
      toast.success("Restaurant created successfully!");
      setIsCreateOpen(false);
      setName("");
      setDescription("");
      setAddress("");
      queryClient.invalidateQueries({ queryKey: ["user-restaurants"] });
      refreshUserData();
      // Navigate to the new restaurant's dashboard
      navigate(`/restaurant/${restaurant.id}/dashboard`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create restaurant");
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <DesktopHeader breadcrumb="Restaurant Management" />

      <main className="container mx-auto px-space-4 py-space-12">
        <div className="flex items-center justify-between mb-space-8">
          <div>
            <h1 className="font-display text-3xl font-bold">My Restaurants</h1>
            <p className="text-muted-foreground">Select a restaurant to manage</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add Restaurant
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Restaurant</DialogTitle>
              </DialogHeader>
              <div className="space-y-space-4">
                <div>
                  <Label htmlFor="name">Restaurant Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter restaurant name"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the restaurant..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Restaurant address"
                  />
                </div>
                <Button 
                  onClick={() => createRestaurantMutation.mutate()} 
                  disabled={!name.trim()}
                  loading={createRestaurantMutation.isPending}
                  loadingText="Creating..."
                  className="w-full"
                >
                  Create Restaurant
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-space-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : restaurants.length === 0 ? (
          <Card className="p-space-12 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground mb-space-4" />
            <CardTitle className="mb-space-2">No Restaurants Yet</CardTitle>
            <CardDescription>Create your first restaurant to get started</CardDescription>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-space-6">
            {restaurants.map((restaurant) => (
              <Link
                key={restaurant.id}
                to={`/restaurant/${restaurant.id}/dashboard`}
                aria-label={`Open ${restaurant.name} dashboard`}
                className="block rounded-radius-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <div className="flex items-center gap-space-3">
                      {restaurant.logo_url ? (
                        <img 
                          src={restaurant.logo_url} 
                          alt="" 
                          className="w-12 h-12 rounded-radius-full object-cover" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-radius-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{restaurant.name}</CardTitle>
                        <p className="text-sm text-muted-foreground truncate">
                          {restaurant.address || "No address"}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      {restaurant.is_owner && (
                        <Badge variant="outline">Owner</Badge>
                      )}
                      <Badge variant={restaurant.is_active ? "default" : "secondary"}>
                        {restaurant.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default RestaurantList;
