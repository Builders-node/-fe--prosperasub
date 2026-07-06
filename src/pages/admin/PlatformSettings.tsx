import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CalendarClock, Settings, Eye } from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";

const PlatformSettings = () => {
  const queryClient = useQueryClient();

  const [minWeeks, setMinWeeks] = useState(1);
  const [maxWeeks, setMaxWeeks] = useState(4);
  const [platformFee, setPlatformFee] = useState(0);

  // Slot capacity
  const [defaultCap, setDefaultCap] = useState(1);
  const [saturdayCap, setSaturdayCap] = useState(1);
  const [applyToFuture, setApplyToFuture] = useState(false);

  const { data: slotSettings } = useQuery({
    queryKey: ["slot-capacity-settings"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/slot-capacity");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (slotSettings) {
      setDefaultCap(slotSettings.default_slot_capacity || 1);
      setSaturdayCap(slotSettings.saturday_slot_capacity || 1);
    }
  }, [slotSettings]);

  const saveCapacityMutation = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi("/admin/slot-capacity", {
        method: "PATCH",
        body: JSON.stringify({
          default_slot_capacity: defaultCap,
          saturday_slot_capacity: saturdayCap,
          apply_to_future: applyToFuture,
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Slot capacity saved!");
      queryClient.invalidateQueries({ queryKey: ["slot-capacity-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/settings");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setMinWeeks(settings.min_subscription_weeks || 1);
      setMaxWeeks(settings.max_subscription_weeks || 4);
      setPlatformFee(Number(settings.platform_fee_percent) || 0);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const settingsData = {
        min_subscription_weeks: minWeeks,
        max_subscription_weeks: maxWeeks,
        platform_fee_percent: platformFee,
      };

      const { error } = await adminApi("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsData),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved!");
      queryClient.invalidateQueries({ queryKey: ["global-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ── Service category visibility (shown/hidden from regular users) ───────────
  const [catVis, setCatVis] = useState({ cleaning: true, cars: true, food: true, beach: true, massage: true });

  useEffect(() => {
    if (settings) {
      setCatVis({
        cleaning: settings.category_cleaning_visible !== false,
        cars: settings.category_cars_visible !== false,
        food: settings.category_food_visible !== false,
        beach: settings.category_beach_visible !== false,
        massage: settings.category_massage_visible !== false,
      });
    }
  }, [settings]);

  const saveVisibilityMutation = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          category_cleaning_visible: catVis.cleaning,
          category_cars_visible: catVis.cars,
          category_food_visible: catVis.food,
          category_beach_visible: catVis.beach,
          category_massage_visible: catVis.massage,
        }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service visibility saved!");
      queryClient.invalidateQueries({ queryKey: ["global-settings"] });
      queryClient.invalidateQueries({ queryKey: ["service-visibility"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <SuperAdminLayout title="Platform Settings">
        <PageLoader />
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout 
      title="Platform Settings" 
      subtitle="Configure global platform behavior"
    >
      <div className="grid gap-space-6 xl:grid-cols-[minmax(0,42rem)_minmax(22rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-space-2">
              <Settings className="h-5 w-5" />
              Global Configuration
            </CardTitle>
            <CardDescription>
              These settings apply to all cleaning plans and users on the platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-space-6">
            <div className="grid grid-cols-2 gap-space-4">
              <div>
                <Label htmlFor="min-weeks">Minimum Subscription Weeks</Label>
                <Input 
                  id="min-weeks"
                  type="number" 
                  value={minWeeks}
                  onChange={(e) => setMinWeeks(parseInt(e.target.value) || 1)}
                  min={1} 
                  max={maxWeeks}
                />
                <p className="text-xs text-muted-foreground mt-space-1">
                  Shortest subscription duration allowed
                </p>
              </div>
              <div>
                <Label htmlFor="max-weeks">Maximum Subscription Weeks</Label>
                <Input 
                  id="max-weeks"
                  type="number" 
                  value={maxWeeks}
                  onChange={(e) => setMaxWeeks(parseInt(e.target.value) || 4)}
                  min={minWeeks} 
                  max={52}
                />
                <p className="text-xs text-muted-foreground mt-space-1">
                  Longest subscription duration allowed
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="fee">Platform Fee (%)</Label>
              <Input 
                id="fee"
                type="number" 
                value={platformFee}
                onChange={(e) => setPlatformFee(parseFloat(e.target.value) || 0)}
                min={0} 
                max={100} 
                step={0.1}
              />
              <p className="text-xs text-muted-foreground mt-space-1">
                Percentage fee taken from each subscription (for future use)
              </p>
            </div>

            <Button 
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              loadingText="Saving..."
              className="w-full"
            >
              Save Settings
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-space-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-space-2">
                <Eye className="h-5 w-5" />
                Service Visibility
              </CardTitle>
              <CardDescription>
                Show or hide service categories from regular users. Admins always see every category.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-space-3">
              {([
                { key: "cleaning", label: "Cleaning" },
                { key: "cars", label: "Car Rental" },
                { key: "food", label: "Food" },
                { key: "massage", label: "Massage" },
                { key: "beach", label: "Beach Club" },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-space-3 rounded-radius-md border border-[hsl(var(--app-divider))] px-space-4 py-space-3">
                  <Label className="cursor-pointer">{label}</Label>
                  <Switch
                    checked={catVis[key]}
                    onCheckedChange={(v) => setCatVis((p) => ({ ...p, [key]: v }))}
                  />
                </div>
              ))}
              <Button
                onClick={() => saveVisibilityMutation.mutate()}
                loading={saveVisibilityMutation.isPending}
                loadingText="Saving..."
                className="w-full"
              >
                Save Visibility
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-space-2">
                <CalendarClock className="h-5 w-5" />
                Slot Capacity
              </CardTitle>
              <CardDescription>
                How many cleanings can be booked per time slot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-space-5">
              <div className="grid grid-cols-2 gap-space-4">
                <div>
                  <Label htmlFor="default-cap">Weekday Capacity</Label>
                  <Input
                    id="default-cap"
                    type="number"
                    value={defaultCap}
                    onChange={(e) => setDefaultCap(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    max={10}
                  />
                  <p className="text-xs text-muted-foreground mt-space-1">
                    Mon–Fri bookings per slot
                  </p>
                </div>
                <div>
                  <Label htmlFor="saturday-cap">Saturday Capacity</Label>
                  <Input
                    id="saturday-cap"
                    type="number"
                    value={saturdayCap}
                    onChange={(e) => setSaturdayCap(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    max={10}
                  />
                  <p className="text-xs text-muted-foreground mt-space-1">
                    Saturday bookings per slot
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                <div>
                  <p className="text-sm font-medium">Apply to existing future slots</p>
                  <p className="text-xs text-muted-foreground">Update all future slots that aren't fully booked</p>
                </div>
                <Switch checked={applyToFuture} onCheckedChange={setApplyToFuture} />
              </div>

              <Button
                onClick={() => saveCapacityMutation.mutate()}
                loading={saveCapacityMutation.isPending}
                loadingText="Saving..."
                className="w-full"
              >
                Save Capacity
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration Scope</CardTitle>
              <CardDescription>Operational tools now live in their own admin sections.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-space-3 text-sm text-muted-foreground">
              <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                Subscription limits control customer checkout duration.
              </div>
              <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                Cleaning schedules are managed from the Operations section.
              </div>
              <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
                Blink test payments are managed from the Payments tab.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </SuperAdminLayout>
  );
};

export default PlatformSettings;
