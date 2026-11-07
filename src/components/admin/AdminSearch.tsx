import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, CreditCard, Search, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NAV_SECTIONS, permissionsForPath } from "@/config/adminNav";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import { adminApi, supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * One search box for the whole admin — ⌘K / Ctrl+K, or the button in the top
 * bar. It answers the three lookups that used to mean guessing which list to
 * open first: a person (name, email, phone), a business (name), and a sale
 * (payment reference, buyer, plan). Pages are in it too, so the sidebar is not
 * the only way to get somewhere.
 *
 * People and businesses are small lists already cached by their own pages and
 * filtered here; sales are asked of `subscriptions_unified` as you type.
 */

interface Hit {
  key: string;
  group: "Pages" | "Customers" | "Businesses" | "Sales";
  icon: LucideIcon;
  title: string;
  detail?: string;
  href: string;
}

const norm = (v: unknown) => String(v ?? "").toLowerCase();
/** PostgREST `or=` treats , ( ) as syntax — a reference never needs them. */
const safeTerm = (q: string) => q.replace(/[,()*%\\:"']/g, " ").trim();

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function AdminSearchButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button variant="secondary" size="sm" className="gap-2 px-3 md:min-w-[200px] md:justify-start"
        onClick={() => setOpen(true)} aria-label="Search the admin">
        <Search className="h-4 w-4" />
        <span className="hidden text-muted-foreground md:inline">Search</span>
        <kbd className="ml-auto hidden rounded-[6px] bg-background px-1.5 text-meta text-muted-foreground md:inline">⌘K</kbd>
      </Button>
      {open && <AdminSearchDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

function AdminSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { canAny, isLoading: permsLoading } = useAdminPermissions();
  const may = (path: string) => {
    const perms = permissionsForPath(path);
    return permsLoading || !perms?.length || canAny(perms as never[]);
  };
  const canCustomers = may("/admin/users");
  const canBusinesses = may("/admin/marketplace");
  const canSales = may("/admin/marketplace/subscriptions");

  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const term = q.trim().toLowerCase();
  const debounced = useDebounced(safeTerm(q.trim()));

  const usersQ = useQuery({
    queryKey: ["admin-users-full"],
    enabled: canCustomers,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/users");
      if (error) throw error;
      return data ?? [];
    },
  });

  const providersQ = useQuery({
    queryKey: ["admin-search-providers"],
    enabled: canBusinesses,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("providers")
        .select("id,name,status,archetype_key,contact_email,contact_phone")
        .order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const salesQ = useQuery({
    queryKey: ["admin-search-sales", debounced],
    enabled: canSales && debounced.length >= 3,
    staleTime: 15_000,
    queryFn: async () => {
      const t = `%${debounced}%`;
      const { data, error } = await supabaseDb.from("subscriptions_unified")
        .select("service,id,user_id,customer_name,plan_name,price_cents,payment_reference,payment_status,created_at")
        .or(`payment_reference.ilike.${t},customer_name.ilike.${t},plan_name.ilike.${t}`)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const hits = useMemo<Hit[]>(() => {
    const out: Hit[] = [];
    const pages = NAV_SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title })))
      .filter((i) => may(i.path))
      .filter((i) => !term || norm(i.label).includes(term) || norm(i.section).includes(term));
    for (const p of pages.slice(0, term ? 5 : 8)) {
      out.push({ key: `page-${p.path}`, group: "Pages", icon: p.icon, title: p.label, detail: p.section, href: p.path });
    }
    if (!term) return out;

    if (canCustomers) {
      const digits = term.replace(/\D/g, "");
      const people = ((usersQ.data ?? []) as any[]).filter((u) =>
        norm(u.display_name).includes(term) || norm(u.name).includes(term) || norm(u.email).includes(term)
        || (digits.length >= 4 && String(u.phone ?? "").replace(/\D/g, "").includes(digits)));
      for (const u of people.slice(0, 6)) {
        out.push({
          key: `user-${u.id}`, group: "Customers", icon: User,
          title: u.display_name || u.name || u.email || "Customer",
          detail: [u.email, u.phone].filter(Boolean).join(" · "),
          href: `/admin/customers/${encodeURIComponent(u.id)}`,
        });
      }
    }
    if (canBusinesses) {
      const biz = (providersQ.data ?? []).filter((p) =>
        norm(p.name).includes(term) || norm(p.contact_email).includes(term));
      for (const p of biz.slice(0, 6)) {
        out.push({
          key: `biz-${p.id}`, group: "Businesses", icon: Building2, title: p.name,
          detail: [p.archetype_key, p.status === "active" || p.status === "approved" ? "live" : p.status].filter(Boolean).join(" · "),
          href: `/admin/marketplace/providers/${p.id}`,
        });
      }
    }
    if (canSales) {
      for (const r of salesQ.data ?? []) {
        out.push({
          key: `sale-${r.service}-${r.id}`, group: "Sales", icon: CreditCard,
          title: `${r.plan_name || r.service} · ${r.customer_name || "—"}`,
          detail: [r.price_cents != null ? formatUSD(Number(r.price_cents)) : null, r.payment_status, r.payment_reference]
            .filter(Boolean).join(" · "),
          href: r.user_id
            ? `/admin/customers/${encodeURIComponent(r.user_id)}`
            : `/admin/marketplace/subscriptions?q=${encodeURIComponent(r.payment_reference || r.customer_name || debounced)}`,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, usersQ.data, providersQ.data, salesQ.data, canCustomers, canBusinesses, canSales, permsLoading]);

  useEffect(() => { setActive(0); }, [term]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-hit="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    onOpenChange(false);
    navigate(h.href);
  };

  const groups = (["Pages", "Customers", "Businesses", "Sales"] as const)
    .map((g) => ({ g, items: hits.map((h, i) => ({ h, i })).filter(({ h }) => h.group === g) }))
    .filter((x) => x.items.length > 0);

  const searchingSales = canSales && debounced.length >= 3 && salesQ.isFetching;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" blocks={false}>
        <DialogHeader>
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <DialogBlock>
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Customer, business, payment reference…"
            aria-label="Search"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
            }}
          />
        </DialogBlock>
        <div ref={listRef} className="space-y-1">
          {groups.map(({ g, items }) => (
            <DialogBlock key={g} title={g} className="space-y-2 p-2 pt-3 [&>h3]:px-2">
              <div className="space-y-0.5">
                {items.map(({ h, i }) => {
                  const Icon = h.icon;
                  return (
                    <button
                      key={h.key}
                      type="button"
                      data-hit={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-radius-md px-2 py-2 text-left transition-colors",
                        i === active ? "bg-inset" : "hover:bg-inset",
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold text-foreground">{h.title}</span>
                        {h.detail && <span className="block truncate text-meta text-muted-foreground">{h.detail}</span>}
                      </span>
                      {i === active && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            </DialogBlock>
          ))}
          {term && hits.filter((h) => h.group !== "Pages").length === 0 && (
            <DialogBlock>
              <p className="text-body text-muted-foreground">
                {searchingSales || usersQ.isLoading || providersQ.isLoading
                  ? "Searching…"
                  : term.length < 3 ? "Keep typing — sales are searched from 3 characters." : `Nothing matches “${q.trim()}”.`}
              </p>
            </DialogBlock>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
