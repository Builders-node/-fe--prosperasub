import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tags as chips: type, press Enter or comma, a chip appears; × or Backspace
 * removes one. Pasting "a, b, c" makes three. A row of suggestions under the
 * field adds one with a tap.
 *
 * Tags are unique ignoring case — they are what a customer filters by, so
 * "Coffee" and "coffee" must not become two filters. The first spelling wins;
 * existing tags are never rewritten.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  max = 20,
  placeholder = "Add a tag",
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  max?: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const full = value.length >= max;

  const add = (raw: string) => {
    const incoming = raw.split(",").map(normalizeTag).filter(Boolean);
    if (incoming.length === 0) return;
    const next = [...value];
    for (const t of incoming) {
      if (next.length >= max) break;
      if (!next.some((v) => same(v, t))) next.push(t);
    }
    if (next.length !== value.length) onChange(next);
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const offered = suggestions.map(normalizeTag)
    .filter((s, i, all) => s && !value.some((v) => same(v, s)) && all.findIndex((x) => same(x, s)) === i)
    .slice(0, 10);

  return (
    <div className={cn("space-y-2", className)}>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-12 w-full cursor-text flex-wrap items-center gap-1.5 rounded-radius-md bg-muted p-2 transition-shadow focus-within:ring-2 focus-within:ring-primary/50"
      >
        {value.map((t) => (
          <span key={t} className="inline-flex h-8 items-center gap-1 rounded-radius-sm bg-card pl-3 pr-1 text-body text-foreground">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={(e) => { e.stopPropagation(); remove(t); }}
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {!full && (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              // A pasted list, or a comma typed on a phone keyboard that never sends keydown.
              if (e.target.value.includes(",")) { add(e.target.value); setDraft(""); }
              else setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => { if (draft.trim()) { add(draft); setDraft(""); } }}
            placeholder={value.length ? "" : placeholder}
            className="h-8 min-w-[8rem] flex-1 bg-transparent px-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        )}
      </div>
      {offered.length > 0 && !full && (
        <p className="text-meta text-muted-foreground">
          Suggested:{" "}
          {offered.map((s, i) => (
            <span key={s}>
              <button type="button" onClick={() => add(s)} className="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline">
                {s}
              </button>
              {i < offered.length - 1 && ", "}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export const normalizeTag = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 40);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
