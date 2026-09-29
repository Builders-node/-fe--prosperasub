import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/ui/spinner";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import {
  fetchDelivery, saveDelivery, type SubscriberSource,
} from "@/services/subscribers";

/**
 * Where a subscription goes, edited.
 *
 * The same dialog for the business and for the customer, because it is the
 * same change: an address moved. It renders whatever the service declared in
 * `deliveryFields`, so a vertical that names its columns gets this for
 * nothing and neither caller knows which one it is looking at.
 *
 * `ownerUserId` is the only thing that differs. A provider editing their
 * subscriber's row passes nothing; a customer editing their own passes their
 * id, and the write carries it as a filter so this screen can only ever move
 * the address on a row that belongs to them.
 */
export function DeliveryDialog({
  open, shape, subscriptionId, title, ownerUserId, onClose, onSaved,
}: {
  open: boolean;
  shape: SubscriberSource;
  subscriptionId: string | null;
  /** Whose subscription — shown under the heading. */
  title?: string | null;
  /** Set by the customer's own screen; the write is then scoped to their row. */
  ownerUserId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fields = shape.deliveryFields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: loaded, isLoading } = useQuery({
    queryKey: ["subscription-delivery", shape.table, subscriptionId],
    enabled: open && !!subscriptionId && fields.length > 0,
    // Always the row as it is right now: whatever opened this can be minutes
    // old, and saving a stale address would quietly overwrite a newer one.
    staleTime: 0,
    queryFn: () => fetchDelivery(shape, subscriptionId!),
  });

  // Seed the draft once the real values arrive, keyed on the row so opening a
  // second subscription does not inherit the first one's address. An effect,
  // not a memo: setting state is the whole point of it.
  useEffect(() => { setValues(loaded ?? {}); }, [loaded, subscriptionId]);

  const submit = async () => {
    if (!subscriptionId) return;
    setSaving(true);
    try {
      await saveDelivery(shape, subscriptionId, values, ownerUserId ?? undefined);
      toast.success("Saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={shape.deliveryLabel ?? "Delivery details"}
      description={title ?? undefined}
      footer={
        <Button
          className="w-full"
          onClick={() => void submit()}
          disabled={saving || isLoading}
          loading={saving}
          loadingText="Saving…"
        >
          Save
        </Button>
      }
    >
      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.column}>
              <Label htmlFor={`d-${f.column}`}>{f.label}</Label>
              {f.multiline ? (
                <Textarea
                  id={`d-${f.column}`}
                  rows={2}
                  value={values[f.column] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.column]: e.target.value }))}
                />
              ) : (
                <Input
                  id={`d-${f.column}`}
                  value={values[f.column] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.column]: e.target.value }))}
                />
              )}
              {f.hint && <p className="mt-1 text-[12px] text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </ResponsiveDialog>
  );
}
