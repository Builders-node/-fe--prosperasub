import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Mail, MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { normalizePhone } from "@/components/patterns/CustomerPhone";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi } from "@/integrations/supabase/client";
import { formatDateHN } from "@/lib/timezone";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";

/**
 * The admin's way to hand a business to its owner: make a link, send it.
 *
 * Setting an owner used to mean finding the person's account id and typing it
 * into the edit sheet, after they had signed up. Now the admin makes a link here
 * (one open link per business, seven days, single use), sends it by WhatsApp or
 * email, and whoever opens it signed in and accepts becomes the owner
 * (`/claim-business`, Edge api routes/owner-invites.ts).
 */
export function OwnerInviteButton({ provider, size = "sm" }: { provider: UniversalProviderRow; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
        <UserPlus /> {provider.admin_user_id ? "Hand over" : "Invite owner"}
      </Button>
      {open && <OwnerInviteDialog provider={provider} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function OwnerInviteDialog({ provider, open, onOpenChange }: {
  provider: UniversalProviderRow; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [link, setLink] = useState<{ url: string; expiresAt: string; emailed?: boolean; to?: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState(provider.contact_email ?? "");
  const key = ["owner-invite-admin", provider.id];

  const statusQ = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await adminApi(`/admin/providers/${provider.id}/owner-invites`);
      if (error) throw error;
      return data as { open: { createdAt: string; expiresAt: string } | null };
    },
  });

  // With an address the platform sends the link itself; without one the
  // admin gets the link to pass on by hand.
  const create = useMutation({
    mutationFn: async (to: string | null) => {
      const { data, error } = await adminApi(`/admin/providers/${provider.id}/owner-invites`, {
        method: "POST",
        body: JSON.stringify(to ? { email: to } : {}),
      });
      if (error) throw error;
      return { ...(data as { url: string; expiresAt: string; emailed?: boolean }), to: to ?? undefined };
    },
    onSuccess: (d) => {
      setLink(d);
      if (d.to) {
        if (d.emailed) toast.success(`Sent to ${d.to}`);
        else toast.warning("Link made, but the email didn't go out — copy and send it.");
      }
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["admin-owner-invites"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not create the link"),
  });

  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi(`/admin/providers/${provider.id}/owner-invites`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: () => { setLink(null); toast.success("Link revoked"); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message || "Could not revoke the link"),
  });

  const message = link
    ? `Hi! Here is the link to take over ${provider.name} on EverySub. Open it, sign in and press Accept: ${link.url}`
    : "";
  const wa = normalizePhone(provider.contact_phone)?.replace(/\D/g, "") ?? null;
  const email = provider.contact_email;

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy — select the link and copy it"); }
  };

  const openLink = statusQ.data?.open ?? null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={provider.admin_user_id ? "Hand over this business" : "Invite the owner"}
      description={`Whoever opens the link signed in and accepts becomes the owner of ${provider.name}.`}
    >
      <DialogBlock title="How it works">
        <ul className="list-disc space-y-1 pl-5 text-body text-muted-foreground">
          <li>The link works once and for seven days.</li>
          <li>The owner manages plans, schedule, team and withdraws the money.</li>
          {provider.admin_user_id && <li>It replaces the current owner when accepted.</li>}
        </ul>
      </DialogBlock>

      {link ? (
        <DialogBlock title="Send this link">
          {link.emailed && link.to && (
            <p className="text-body text-foreground">Emailed to <strong>{link.to}</strong>. You can also send it yourself:</p>
          )}
          <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
          <p className="text-meta text-muted-foreground">Valid until {formatDateHN(link.expiresAt)}. Making a new one replaces it.</p>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-2" onClick={() => void copy()}><Copy /> Copy link</Button>
            {wa && (
              <Button variant="secondary" className="gap-2" asChild>
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            )}
            {email && (
              <Button variant="secondary" className="gap-2" asChild>
                <a href={`mailto:${email}?subject=${encodeURIComponent(`Your business on EverySub: ${provider.name}`)}&body=${encodeURIComponent(message)}`}>
                  <Mail /> Email
                </a>
              </Button>
            )}
          </div>
        </DialogBlock>
      ) : (
        <DialogBlock title="Link">
          {statusQ.isLoading ? (
            <p className="text-body text-muted-foreground">Checking…</p>
          ) : statusQ.isError ? (
            <p className="text-body text-muted-foreground">Couldn't check for an open link — you can still make a new one.</p>
          ) : openLink ? (
            <p className="text-body text-muted-foreground">
              A link made {formatDateHN(openLink.createdAt)} is open until {formatDateHN(openLink.expiresAt)}.
              It can't be shown again — make a new one to send it, or revoke it.
            </p>
          ) : (
            <p className="text-body text-muted-foreground">No open link.</p>
          )}
          <div className="flex items-end gap-2">
            <Input
              label="Owner's email"
              type="email"
              inputSize="sm"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="owner@business.com"
              wrapperClassName="min-w-0 flex-1"
            />
            <Button size="sm" className="shrink-0 gap-2" loading={create.isPending && !!inviteEmail.trim()}
              disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())}
              onClick={() => create.mutate(inviteEmail.trim())}>
              <Mail /> Send invite
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" loading={create.isPending && !inviteEmail.trim()} onClick={() => create.mutate(null)}>
              <Link2 /> {openLink ? "Just make a new link" : "Just make a link"}
            </Button>
            {openLink && (
              <Button variant="secondary" loading={revoke.isPending} onClick={() => revoke.mutate()}>Revoke</Button>
            )}
          </div>
        </DialogBlock>
      )}
    </ResponsiveDialog>
  );
}
