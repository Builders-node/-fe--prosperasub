import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Edit, Store, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";

const ManageRestaurants = () => {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ["all-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: users } = useQuery({
    queryKey: ["restaurant-admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, name, display_name, restaurant_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: restaurantAdmins } = useQuery({
    queryKey: ["restaurant-admins-junction"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_admins")
        .select("user_id, restaurant_id, is_owner");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!userData?.id) throw new Error("Not authenticated");

      const adminUser = adminEmail ? users?.find((u) => u.email === adminEmail) : null;
      
      const { data: restaurant, error: restError } = await supabase
        .from("restaurants")
        .insert({
          name,
          description,
          address,
          logo_url: logoUrl || null,
          opening_hours: openingHours ? { text: openingHours } : null,
          is_active: true,
          created_by: userData.id,
        })
        .select()
        .single();

      if (restError) throw restError;

      const creatorIsOwner = !adminUser || adminUser.id === userData.id;
      const { error: creatorLinkError } = await supabase
        .from("restaurant_admins")
        .upsert(
          {
            user_id: userData.id,
            restaurant_id: restaurant.id,
            is_owner: creatorIsOwner,
          },
          { onConflict: "user_id,restaurant_id" }
        );
      if (creatorLinkError) throw creatorLinkError;

      if (adminUser && adminUser.id !== userData.id) {
        const { error: adminLinkError } = await supabase
          .from("restaurant_admins")
          .upsert(
            {
              user_id: adminUser.id,
              restaurant_id: restaurant.id,
              is_owner: true,
            },
            { onConflict: "user_id,restaurant_id" }
          );
        if (adminLinkError) throw adminLinkError;

        await supabase
          .from("users")
          .update({ restaurant_id: restaurant.id })
          .eq("id", adminUser.id);

        await supabase.from("user_roles").upsert({
          user_id: adminUser.id,
          role: "restaurant_admin",
        }, { onConflict: "user_id,role" });
      }

      return restaurant;
    },
    onSuccess: () => {
      toast.success("Restaurant created!");
      queryClient.invalidateQueries({ queryKey: ["all-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-admins"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-admins-junction"] });
      setIsAddOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("No restaurant selected");
      
      const { error } = await supabase
        .from("restaurants")
        .update({
          name,
          description,
          address,
          logo_url: logoUrl || null,
          opening_hours: openingHours ? { text: openingHours } : null,
        })
        .eq("id", editingId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Restaurant updated!");
      queryClient.invalidateQueries({ queryKey: ["all-restaurants"] });
      setEditingId(null);
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("restaurants")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated!");
      queryClient.invalidateQueries({ queryKey: ["all-restaurants"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (restaurantId: string) => {
      await supabase.from("restaurant_admins").delete().eq("restaurant_id", restaurantId);
      await supabase.from("restaurant_settings").delete().eq("restaurant_id", restaurantId);
      await supabase.from("subscription_plans").delete().eq("restaurant_id", restaurantId);
      await supabase.from("menu_items").delete().eq("restaurant_id", restaurantId);
      await supabase.from("weekly_menus").delete().eq("restaurant_id", restaurantId);
      await supabase.from("products").delete().eq("restaurant_id", restaurantId);
      await supabase.from("users").update({ restaurant_id: null }).eq("restaurant_id", restaurantId);
      
      const { error } = await supabase.from("restaurants").delete().eq("id", restaurantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Restaurant deleted successfully!");
      queryClient.invalidateQueries({ queryKey: ["all-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-admins"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-admins-junction"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setAddress("");
    setLogoUrl("");
    setOpeningHours("");
    setAdminEmail("");
  };

  const openEditDialog = (restaurant: any) => {
    setEditingId(restaurant.id);
    setName(restaurant.name);
    setDescription(restaurant.description || "");
    setAddress(restaurant.address || "");
    setLogoUrl(restaurant.logo_url || "");
    setOpeningHours(restaurant.opening_hours?.text || "");
  };

  const getAdminsForRestaurant = (restaurantId: string) => {
    const adminUserIds = restaurantAdmins
      ?.filter((ra) => ra.restaurant_id === restaurantId)
      .map((ra) => ra.user_id) || [];
    
    return users?.filter((u) => adminUserIds.includes(u.id)) || [];
  };

  if (isLoading) {
    return (
      <SuperAdminLayout title="Manage Restaurants">
        <div className="flex items-center justify-center py-space-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout 
      title="Manage Restaurants" 
      subtitle="Create, edit, and manage restaurant accounts"
    >
      <div className="flex items-center justify-end mb-space-6">
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Add Restaurant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Restaurant</DialogTitle>
            </DialogHeader>
            <div className="space-y-space-4">
              <div>
                <Label>Restaurant Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant name" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
              </div>
              <div>
                <Label>Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" />
              </div>
              <div>
                <Label>Logo URL (optional)</Label>
                <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Opening Hours</Label>
                <Input value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} placeholder="Mon-Fri: 9am-5pm" />
              </div>
              <div>
                <Label>Admin Email (optional)</Label>
                <Input 
                  value={adminEmail} 
                  onChange={(e) => setAdminEmail(e.target.value)} 
                  placeholder="admin@restaurant.com"
                  type="email"
                />
                <p className="text-xs text-muted-foreground mt-space-1">
                  If this email exists in the system, they will be assigned as admin
                </p>
              </div>
              <Button 
                onClick={() => createMutation.mutate()} 
                disabled={!name}
                loading={createMutation.isPending}
                className="w-full"
              >
                Create Restaurant
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {restaurants?.length === 0 ? (
        <Card className="p-space-12 text-center">
          <Store className="h-12 w-12 mx-auto text-muted-foreground mb-space-4" />
          <CardTitle className="mb-space-2">No Restaurants Yet</CardTitle>
          <CardDescription>Add your first restaurant to get started.</CardDescription>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restaurants?.map((restaurant) => {
                const admins = getAdminsForRestaurant(restaurant.id);
                return (
                  <TableRow key={restaurant.id}>
                    <TableCell>
                      <div className="flex items-center gap-space-3">
                        {restaurant.logo_url ? (
                          <img src={restaurant.logo_url} alt="" className="w-10 h-10 rounded-radius-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-radius-full bg-muted flex items-center justify-center">
                            <Store className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{restaurant.name}</div>
                          <div className="text-sm text-muted-foreground">{restaurant.address}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {admins.length > 0 ? (
                        <div className="flex flex-col gap-space-1">
                          {admins.map((admin) => (
                            <span key={admin.id} className="text-sm">
                              {admin.email || admin.name || admin.display_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No admin assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-space-2">
                        <Switch
                          checked={restaurant.is_active || false}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: restaurant.id, isActive: checked })
                          }
                          disabled={toggleActiveMutation.isPending}
                        />
                        <Badge variant={restaurant.is_active ? "default" : "secondary"}>
                          {restaurant.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-space-1">
                        <Dialog open={editingId === restaurant.id} onOpenChange={(open) => {
                          if (open) openEditDialog(restaurant);
                          else setEditingId(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button variant="tertiary" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Restaurant</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-space-4">
                              <div>
                                <Label>Restaurant Name</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} />
                              </div>
                              <div>
                                <Label>Description</Label>
                                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                              </div>
                              <div>
                                <Label>Address</Label>
                                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                              </div>
                              <div>
                                <Label>Logo URL</Label>
                                <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
                              </div>
                              <div>
                                <Label>Opening Hours</Label>
                                <Input value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} />
                              </div>
                              <Button 
                                onClick={() => updateMutation.mutate()} 
                                disabled={!name}
                                loading={updateMutation.isPending}
                                className="w-full"
                              >
                                Save Changes
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="tertiary" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Restaurant?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete <strong>{restaurant.name}</strong> and all associated data including:
                                <ul className="list-disc list-inside mt-space-2 space-y-space-1">
                                  <li>All subscription plans</li>
                                  <li>All weekly menus and menu items</li>
                                  <li>All products</li>
                                  <li>Admin assignments</li>
                                </ul>
                                <p className="mt-space-4 font-semibold text-destructive">
                                  This action cannot be undone.
                                </p>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(restaurant.id)}
                                variant="destructive"
                              >
                                {deleteMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Delete Restaurant"
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </SuperAdminLayout>
  );
};

export default ManageRestaurants;
