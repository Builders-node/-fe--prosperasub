import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { format } from "date-fns";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { formatUSD } from "@/lib/pricing";

const AdminSubscriptions = () => {
  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from('subscriptions')
        .select('*, restaurants(name), subscription_plans(name)')
        .order('created_at', { ascending: false });

      if (error) return [];

      // Look up user names
      const userIds = [...new Set((data || []).map((s: any) => s.user_id).filter(Boolean))];
      const { data: usersData } = await supabaseDb
        .from("users")
        .select("id, name, display_name, email")
        .in("id", userIds);
      const usersMap = new Map((usersData ?? []).map((u: any) => [String(u.id), u]));

      return (data || []).map((s: any) => ({
        ...s,
        users: usersMap.get(String(s.user_id)) || null,
      }));
    },
  });

  // Format as USD (stored as cents)
  const formatPrice = (cents: number) => formatUSD(cents);

  const truncatePubkey = (pubkey: string | null) => {
    if (!pubkey) return 'N/A';
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
  };

  return (
    <SuperAdminLayout title="Food Subscriptions" subtitle="All meal plan subscriptions across the platform">
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions ({subscriptions?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : subscriptions && subscriptions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Restaurant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Dates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {sub.users?.display_name || sub.users?.email || 'Anonymous'}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {truncatePubkey(sub.users?.lightning_pubkey)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{sub.restaurants?.name || 'N/A'}</TableCell>
                      <TableCell>{sub.subscription_plans?.name || 'N/A'}</TableCell>
                      <TableCell>{sub.duration_weeks} weeks</TableCell>
                      <TableCell className="font-mono">
                        {formatPrice(sub.total_price_sats)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={sub.payment_status === 'paid' ? 'default' : 'secondary'}
                          className={sub.payment_status === 'pending' ? 'bg-warning/10 text-warning border-warning/20' : ''}
                        >
                          {sub.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sub.is_active ? 'default' : 'secondary'}>
                          {sub.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{format(new Date(sub.start_date), 'MMM d')}</div>
                        <div className="text-muted-foreground">to {format(new Date(sub.end_date), 'MMM d, yyyy')}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground">No subscriptions found.</p>
          )}
        </CardContent>
      </Card>
    </SuperAdminLayout>
  );
};

export default AdminSubscriptions;
