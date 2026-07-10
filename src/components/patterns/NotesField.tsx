import { useEffect, useRef, useState } from "react";
import { MessageCircle, ChevronRight } from "lucide-react";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Row label ("Notes", "Delivery notes", "Cleaner hints", …). */
  label?: string;
  /** Placeholder shown inside the modal when the note is empty. */
  placeholder?: string;
  /** Optional icon override — defaults to MessageCircle. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Sheet header title. */
  title?: string;
  /** Sheet header description under the title. */
  description?: string;
  /** Character cap for the note. */
  maxLength?: number;
  /** Extra class on the row wrapper (padding tweaks per-page). */
  className?: string;
}

/**
 * Yandex Eda "Комментарий" pattern.
 *
 *   ┌────────────────────────────────────────┐   ← inline row
 *   │  💬  NOTES                    Preview…  › │
 *   └────────────────────────────────────────┘
 *
 * Tap the row → responsive dialog (bottom sheet on mobile / centered dialog
 * on desktop) with a big centered heading, subtitle, auto-focused textarea
 * that fills the sheet, and a sticky "Save" CTA. Editing happens in a
 * distraction-free surface — no cramped textarea inside a form list.
 *
 * `onChange` fires on Save so the parent form only sees committed values.
 * Cancelling (dismissing the sheet without Save) reverts the draft.
 */
export function NotesField({
  value,
  onChange,
  label = "Notes",
  placeholder = "Add a note (optional)",
  icon: Icon = MessageCircle,
  title = "Comment",
  description,
  maxLength = 500,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset the draft to the committed value each time the sheet opens.
  useEffect(() => {
    if (open) {
      setDraft(value);
      // Autofocus after the sheet's mount animation.
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        // Move cursor to the end so long existing notes are easy to append.
        const el = textareaRef.current;
        if (el) el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [open, value]);

  const commit = () => {
    onChange(draft.trim());
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30", className)}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-base",
              value ? "text-foreground" : "text-muted-foreground/60",
            )}
          >
            {value || placeholder}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={<span className="block text-center">{title}</span>}
        description={description ? <span className="block text-center">{description}</span> : undefined}
        footer={
          <Button
            onClick={commit}
            size="lg"
            className="h-14 w-full rounded-2xl text-base font-bold"
          >
            Save
          </Button>
        }
      >
        <textarea
          ref={textareaRef}
          value={draft}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={8}
          className="min-h-[220px] w-full resize-none border-0 bg-transparent px-0 py-4 text-lg text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">
          {draft.length}/{maxLength}
        </p>
      </ResponsiveDialog>
    </>
  );
}
