import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Settings } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";

const PlatformSettings = () => {
  const queryClient = useQueryClient();
  
  const [minWeeks, setMinWeeks] = useState(1);
  const [maxWeeks, setMaxWeeks] = useState(4);
  const [cutoffHours, setCutoffHours] = useState(3);
  const [platformFee, setPlatformFee] = useState(0);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["global-settings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("global_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setMinWeeks(settings.min_subscription_weeks || 1);
      setMaxWeeks(settings.max_subscription_weeks || 4);
      setCutoffHours(settings.daily_choice_cutoff_hours || 3);
      setPlatformFee(Number(settings.platform_fee_percent) || 0);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const settingsData = {
        min_subscription_weeks: minWeeks,
        max_subscription_weeks: maxWeeks,
        daily_choice_cutoff_hours: cutoffHours,
        platform_fee_percent: platformFee,
      };

      if (settings?.id) {
        const { error } = await supabaseDb
          .from("global_settings")
          .update(settingsData)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseDb
          .from("global_settings")
          .insert(settingsData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Settings saved!");
      queryClient.invalidateQueries({ queryKey: ["global-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <SuperAdminLayout title="Platform Settings">
        <div className="flex items-center justify-center py-space-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
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
              These settings apply to all restaurants and users on the platform
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
              <Label htmlFor="cutoff">Daily Choice Cutoff (hours before meal)</Label>
              <Input 
                id="cutoff"
                type="number" 
                value={cutoffHours}
                onChange={(e) => setCutoffHours(parseInt(e.target.value) || 3)}
                min={1}
                max={24}
              />
              <p className="text-xs text-muted-foreground mt-space-1">
                How many hours before the meal time users must make their choice. After this, choices are locked.
              </p>
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
              Daily cutoff controls when meal choices become locked.
            </div>
            <div className="rounded-radius-lg bg-[hsl(var(--app-control))] p-space-4">
              Blink test payments are managed from the Payments tab.
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
};

export default PlatformSettings;
