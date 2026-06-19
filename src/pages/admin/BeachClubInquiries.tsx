import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Mail } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabaseDb } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Inquiry {
  id: string;
  plan_name: string | null;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

const STATUSES = ["new", "contacted", "converted", "closed"] as const;
const STATUS_CLASS: Record<string, string> = {
  new:       "text-cyan-400",
  contacted: "text-yellow-400",
  converted: "text-emerald-400",
  closed:    "text-muted-foreground",
};

export default function BeachClubInquiries() {
  const qc = useQueryClient();

  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["admin-beach-club-inquiries"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_inquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Inquiry[];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabaseDb
        .from("beach_club_inquiries")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-beach-club-inquiries"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDb.from("beach_club_inquiries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inquiry removed");
      qc.invalidateQueries({ queryKey: ["admin-beach-club-inquiries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <SuperAdminLayout title="Beach Club Inquiries"><PageLoader /></SuperAdminLayout>;
  }

  return (
    <SuperAdminLayout title="Beach Club Inquiries" subtitle="Membership requests from the public Beach Club page">
      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--app-divider))]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inquiries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Mail className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No inquiries yet.
                </TableCell>
              </TableRow>
            ) : inquiries.map((q) => (
              <TableRow key={q.id}>
                <TableCell>
                  <p className="font-bold text-foreground">{q.name || "—"}</p>
                  {q.email && <p className="text-xs text-muted-foreground">{q.email}</p>}
                  {q.whatsapp && <p className="text-xs text-muted-foreground">{q.whatsapp}</p>}
                </TableCell>
                <TableCell className="text-sm">{q.plan_name || "—"}</TableCell>
                <TableCell className="max-w-[280px] text-sm text-muted-foreground">{q.message || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(q.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Select value={q.status} onValueChange={(status) => statusMutation.mutate({ id: q.id, status })}>
                    <SelectTrigger className={`h-8 w-[130px] text-xs font-semibold ${STATUS_CLASS[q.status] ?? ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="iconSm" variant="ghost" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title="Delete" onClick={() => deleteMutation.mutate(q.id)}>
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SuperAdminLayout>
  );
}
