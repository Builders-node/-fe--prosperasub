import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Ban, ChevronRight, LifeBuoy, Store, UserCheck } from "lucide-react";
import { toast } from "sonner";

import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { ContactActions } from "@/components/admin/customers/ContactActions";
import {
  useCustomerContacts, useCustomerSales, useCustomerServices, type CustomerSale,
} from "@/components/admin/customers/customerActivity";
import { pickPhone } from "@/components/patterns/CustomerPhone";
import { QueryError } from "@/components/patterns/QueryError";
import { StatusPill, statusLabel } from "@/components/patterns/StatusPill";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { EditUserForm } from "./Users";
import { Photo, initialsOf } from "@/components/patterns/Photo";
import { useCustomerBusinesses } from "@/lib/admin/useCustomerBusinesses";
import { useServiceArchetypes } from "@/hooks/useServiceArchetypes";

/**
 * One customer, on one page (`/admin/customers/:userId`).
 *
 * "Who is this person" used to take three to five screens: the Users sheet for
 * the name, Subscriptions for what they hold, Support for what they wrote,
 * Finance for what they paid. This page answers it top-down — who and how to
 * reach them, what they hold now, what they have paid, everything they ever
 * bought, what they wrote to us — and keeps the editing (profile, address,
 * credit, roles) below, where it is needed least often.
 *
 * The old `/admin/users?userId=` link still works: the list redirects here.
 */

const isPaid = (s: CustomerSale) => String(s.paymentStatus ?? "").toLowerCase() === "paid" && s.status !== "cancelled";
const isOwed = (s: CustomerSale) =>
  !["paid", "refunded"].includes(String(s.paymentStatus ?? "").toLowerCase()) && !["cancelled", "expired"].includes(s.status);

function initials(name?: string | null) {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}

export default function AdminCustomer() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmBlock, setConfirmBlock] = useState(false);

  // Same key as the list, so arriving from it costs nothing.
  const usersQ = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/users");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
  const user = useMemo(
    () => ((usersQ.data ?? []) as any[]).find((u) => String(u.id) === userId) ?? null,
    [usersQ.data, userId],
  );

  const { data: contacts } = useCustomerContacts();
  const { data: sales = [], isLoading: salesLoading } = useCustomerSales(userId);
  const { metaOf: serviceMeta } = useCustomerServices();

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["admin-user-audit", userId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await adminApi(`/admin/users/${userId}/audit`);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Businesses they own or help run — a customer here may also be a seller.
  const businessesQ = useCustomerBusinesses(userId, user?.email);
  const { archetypes } = useServiceArchetypes(false);
  const serviceLabel = (key: string | null) => archetypes.find((a) => a.key === key)?.label ?? "No service";

  // Support messages are service-role only; the admin endpoint returns the
  // latest 200 and this keeps the ones from this person (by account, or by
  // the email they typed while signed out).
  const supportQ = useQuery({
    queryKey: ["admin-support-messages", "all"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/support/messages?status=all");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const messages = useMemo(() => {
    const email = String(user?.email ?? "").toLowerCase();
    return (supportQ.data ?? []).filter((m) =>
      String(m.user_id ?? "") === userId || (!!email && String(m.email ?? "").toLowerCase() === email));
  }, [supportQ.data, user, userId]);

  // A link to someone who is not there (deleted, mistyped) says so.
  useEffect(() => {
    if (usersQ.isLoading || usersQ.isError || user) return;
    toast.error("That customer isn't in the list — they may have been deleted.");
    navigate("/admin/users", { replace: true });
  }, [usersQ.isLoading, usersQ.isError, user, navigate]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users-full"] });

  const update = useMutation({
    mutationFn: async (fields: { name?: string; display_name?: string }) => {
      const { error } = await adminApi(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(fields) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const block = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await adminApi(`/admin/users/${userId}/block`, { method: "PATCH", body: JSON.stringify({ block: next }) });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => { toast.success(next ? "Blocked" : "Unblocked"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const softDelete = useMutation({
    mutationFn: async () => {
      const { error } = await adminApi(`/admin/users/${userId}`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer deleted"); invalidate(); navigate("/admin/users", { replace: true }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (usersQ.isError) {
    return (
      <SuperAdminLayout title="Customer">
        <QueryError title="Couldn't load this customer" error={usersQ.error} onRetry={() => void usersQ.refetch()} />
      </SuperAdminLayout>
    );
  }
  if (!user) return <SuperAdminLayout title="Customer"><PageLoader /></SuperAdminLayout>;

  const name = user.display_name || user.name || user.email || "Customer";
  const contact = contacts?.get(userId);
  const phone = pickPhone(user.phone, contact?.phone);
  const whatsapp = pickPhone(contact?.whatsapp, user.phone);
  const active = sales.filter((s) => s.active);
  const paidCents = sales.filter(isPaid).reduce((t, s) => t + (s.amountCents ?? 0), 0);
  const owed = sales.filter(isOwed);
  const owedCents = owed.reduce((t, s) => t + (s.amountCents ?? 0), 0);
  const blocked = !!user.isBlocked;

  return (
    <SuperAdminLayout title={name}>
      <div className="space-y-1">
        <Link to="/admin/users" className="mb-3 inline-flex items-center gap-1.5 text-body text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Customers
        </Link>

        {/* Who, and how to reach them. */}
        <section className="flex flex-wrap items-center gap-4 rounded-radius-lg bg-card p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-title font-semibold text-foreground">
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-title font-semibold text-foreground">{name}</p>
              {blocked
                ? <StatusPill status="blocked" label="Blocked" />
                : <StatusPill status={active.length ? "active" : sales.length ? "expired" : "pending"}
                    label={active.length ? "Customer" : sales.length ? "Lapsed" : "No purchases"} />}
            </div>
            <p className="truncate text-meta text-muted-foreground">
              {[user.email, phone, contact?.addressLine].filter(Boolean).join(" · ")}
            </p>
            <p className="text-meta text-muted-foreground">
              Joined {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
              {" · "}Last seen {user.last_login_at ? format(new Date(user.last_login_at), "MMM d, yyyy") : "never"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ContactActions name={name} phone={phone} whatsapp={whatsapp} email={user.email} />
            {blocked ? (
              <Button size="sm" variant="secondary" className="gap-2" loading={block.isPending} onClick={() => block.mutate(false)}>
                <UserCheck /> Unblock
              </Button>
            ) : (
              <Button size="sm" variant="secondary" className="gap-2" onClick={() => setConfirmBlock(true)}>
                <Ban /> Block
              </Button>
            )}
          </div>
        </section>

        {/* Money, at a glance. */}
        <section className="grid grid-cols-2 gap-1 md:grid-cols-4">
          <Figure label="Active now" value={String(active.length)} />
          <Figure label="Paid, all time" value={formatUSD(paidCents)} />
          <Figure label="Awaiting payment" value={owed.length ? formatUSD(owedCents) : "—"} warn={owed.length > 0} />
          <Figure label="Purchases" value={String(sales.length)} />
        </section>

        {/* What they run, if anything — owner or manager. */}
        {(businessesQ.data?.length ?? 0) > 0 && (
          <section className="rounded-radius-lg bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-title font-semibold text-foreground">
              <Store className="h-4 w-4 text-muted-foreground" /> Businesses
            </h2>
            <div className="space-y-1">
              {businessesQ.data!.map((b) => (
                <Link
                  key={b.id}
                  to={`/admin/marketplace/providers/${b.id}`}
                  className="flex items-center gap-3 rounded-radius-md bg-inset p-3 transition-colors hover:bg-muted"
                >
                  <span aria-hidden className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
                    <Photo src={b.avatarUrl} label={initialsOf(b.name)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-foreground">{b.name}</p>
                    <p className="truncate text-meta text-muted-foreground">
                      {b.role === "owner" ? "Owner" : "Manager"} · {serviceLabel(b.archetypeKey)}
                    </p>
                  </div>
                  {b.status && <StatusPill status={b.status} className="shrink-0" />}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Everything they bought, live first. */}
        <section className="rounded-radius-lg bg-card p-4">
          <h2 className="mb-3 text-title font-semibold text-foreground">Purchases</h2>
          {salesLoading ? (
            <p className="text-body text-muted-foreground">Loading…</p>
          ) : sales.length === 0 ? (
            <p className="text-body text-muted-foreground">Nothing bought yet.</p>
          ) : (
            <div className="space-y-1">
              {[...active, ...sales.filter((s) => !s.active)].map((s) => (
                <Link
                  key={s.key}
                  to={`/admin/marketplace/subscriptions?q=${encodeURIComponent(user.email ?? name)}`}
                  className="flex items-center gap-3 rounded-radius-md bg-inset p-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-foreground">{s.name}</p>
                    <p className="truncate text-meta text-muted-foreground">
                      {serviceMeta(s.service).label}
                      {s.paymentStatus && <> · {statusLabel(s.paymentStatus)}</>}
                      {s.createdAt && <> · {format(new Date(s.createdAt), "MMM d, yyyy")}</>}
                    </p>
                  </div>
                  {s.amountCents != null && (
                    <span className={cn("shrink-0 text-body font-semibold tabular-nums", isOwed(s) ? "text-primary" : "text-foreground")}>
                      {formatUSD(s.amountCents)}
                    </span>
                  )}
                  <StatusPill status={s.active ? "active" : s.status} className="shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* What they wrote to us. */}
        <section className="rounded-radius-lg bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-title font-semibold text-foreground">
            <LifeBuoy className="h-4 w-4 text-muted-foreground" /> Support
          </h2>
          {supportQ.isError ? (
            <p className="text-body text-muted-foreground">Couldn't load support messages.</p>
          ) : messages.length === 0 ? (
            <p className="text-body text-muted-foreground">{supportQ.isLoading ? "Loading…" : "No messages from them."}</p>
          ) : (
            <div className="space-y-1">
              {messages.slice(0, 10).map((m) => (
                <Link key={m.id} to="/admin/support" className="block rounded-radius-md bg-inset p-3 transition-colors hover:bg-muted">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-body font-semibold text-foreground">{m.subject}</p>
                    <StatusPill status={m.status === "new" ? "pending" : "completed"} label={m.status === "new" ? "New" : "Handled"} className="shrink-0" />
                  </div>
                  <p className="line-clamp-2 text-meta text-muted-foreground">{m.message}</p>
                  <p className="mt-1 text-meta text-muted-foreground">{m.created_at ? format(new Date(m.created_at), "MMM d, yyyy · h:mm a") : ""}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Editing — profile, address, credit, history, roles. */}
        <section className="rounded-radius-lg bg-card p-4">
          <h2 className="text-title font-semibold text-foreground">Profile &amp; settings</h2>
          <EditUserForm
            key={user.id}
            user={user}
            auditLogs={auditLogs as any[]}
            hidePurchases
            onSave={(d) => update.mutate(d)}
            onSoftDelete={() => softDelete.mutate()}
            saving={update.isPending}
            deleting={softDelete.isPending}
          />
        </section>
      </div>

      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to the platform immediately and can't sign in. Active subscriptions keep
              running and are not refunded. You can unblock them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { block.mutate(true); setConfirmBlock(false); }}>
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
}

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-radius-lg bg-card p-4">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-heading font-semibold tabular-nums", warn ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}
