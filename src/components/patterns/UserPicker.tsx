import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
}

/** Searchable dropdown of platform users. No external popover dep — self-contained. */
export function UserPicker({
  value,
  onSelect,
  placeholder = "Select a user…",
  allowClear = false,
  clearLabel = "Clear selection",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["platform-users-picker"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("users")
        .select("id, email, name, display_name")
        .order("email", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PickerUser[];
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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? labelFor(selected) : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-input bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b border-input px-3 py-2">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
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
            {isLoading && <p className="px-3 py-2 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No users found</p>
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
        </div>
      )}
    </div>
  );
}
