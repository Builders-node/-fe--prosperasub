import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { accountApi } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tr } from "@/lib/tr";

/**
 * The business's till PIN: staff type it after scanning a customer's QR to
 * record a collection without signing in (components/till/TillCollectCard).
 * The server stores only a hash and never sends the PIN back; only the owner
 * (or an admin) may change it — anyone else is told so by the API.
 */
export function TillPinForm({ providerId }: { providerId: string }) {
  const qc = useQueryClient();
  const key = ["till-pin", providerId];
  const [pin, setPin] = useState("");
  const [editing, setEditing] = useState(false);

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/till-pin`);
      if (error) throw error;
      return data as { set: boolean; updatedAt: string | null };
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await accountApi(`/account/providers/${providerId}/till-pin`, {
        method: "PUT", body: JSON.stringify({ pin }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Till PIN saved — tell it to your staff"));
      setPin(""); setEditing(false);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : tr("Could not save the PIN")),
  });

  const showForm = editing || data?.set === false;
  return (
    <div className="mt-4 rounded-radius-md bg-inset p-3">
      <p className="flex items-center gap-1.5 text-body font-semibold text-foreground">
        <Lock className="h-4 w-4" />{" "}{tr("Till PIN")}</p>
      <p className="mt-1 text-meta text-muted-foreground">{tr("Staff scan the customer's subscription QR on any phone, press Get and type this PIN — no sign-in needed. Five wrong tries lock it for 15 minutes.")}</p>
      {showForm ? (
        <div className="mt-2 flex gap-2">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            placeholder={tr("4–6 digits")}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="max-w-[180px] tracking-[0.3em]"
          />
          <Button size="sm" disabled={pin.length < 4 || save.isPending} loading={save.isPending} onClick={() => save.mutate()}>{tr("Save")}</Button>
          {data?.set && (
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setPin(""); }}>{tr("Cancel")}</Button>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-body text-foreground">{tr("Set")}{data?.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleDateString()}` : ""}</span>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{tr("Change")}</Button>
        </div>
      )}
    </div>
  );
}
