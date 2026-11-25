import { fieldClass } from "@/components/ui/input";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { accountApi } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/tr";

export interface PickerUser {
  id: string;
  email: string | null;
  name: string | null;
  display_name: string | null;
}

const labelFor = (u: PickerUser) => u.display_name || u.name || u.email || u.id;

interface Props {
  /** Currently selected user id (empty string = none). */
  value: string;
  onSelect: (user: PickerUser | null) => void;
  placeholder?: string;
  /** Show a "clear selection" row (used for owner, where blank removes the owner). */
  allowClear?: boolean;
  clearLabel?: string;
  /**
   * The business this pick is for (universal `providers.id`). Everyone except
   * a platform admin MUST pass it, and then sees only people who have bought
   * from that business — the list comes from the server, which checks.
   */
  providerId?: string | null;
}

/** Searchable dropdown of people — everyone for an admin, a business's own customers otherwise. */
export function UserPicker({
  value,
  onSelect,
  placeholder = tr("Select a user…"),
  allowClear = false,
  clearLabel = tr("Clear selection"),
  providerId = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Never the `users` table straight from the browser: that handed every
  // account on the platform, with its email, to whoever opened this. The
  // server answers admins with everyone and a business with its own customers.
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["people-picker", providerId ?? "all"],
    queryFn: async () => {
      const path = providerId ? `/account/people?providerId=${encodeURIComponent(providerId)}` : "/account/people";
      const { data, error } = await accountApi(path);
      if (error) throw error;
      return ((data as { people?: PickerUser[] } | null)?.people ?? []) as PickerUser[];
    },
    staleTime: 60_000,
  });

  const selected = users.find((u) => u.id === value) ?? null;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        [u.email, u.name, u.display_name, u.id].some((f) => (f ?? "").toLowerCase().includes(q)),
      )
    : users;

  // In a layer of its own (a portal), not inside the field: a dialog's body
  // scrolls, and a list drawn inside it was cut off at the dialog's edge.
  return (
    // modal: a dialog locks scrolling to itself, and a list portalled out of it
    // would not scroll with the wheel unless it takes the lock in turn.
    <Popover modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
      <button
        type="button"
        className={cn(fieldClass, "flex items-center justify-between text-left")}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? labelFor(selected) : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-radius-md bg-popover p-0 text-popover-foreground shadow-figma"
      >
          <div className="flex items-center gap-2 bg-muted px-3 py-2">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Search by name or email…")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {allowClear && (
              <button
                type="button"
                onClick={() => { onSelect(null); setOpen(false); setSearch(""); }}
                className="flex w-full items-center px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                <X className="mr-2 h-4 w-4" /> {clearLabel}
              </button>
            )}
            {isLoading && <p className="px-3 py-2 text-sm text-muted-foreground">{tr("Loading…")}</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">{tr("No users found")}</p>
            )}
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onSelect(u); setOpen(false); setSearch(""); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{u.display_name || u.name || "Unnamed"}</span>
                  <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                </span>
                {u.id === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
      </PopoverContent>
    </Popover>
  );
}
