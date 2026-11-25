import { useEffect, useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { accountApi, supabaseDb } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogBlock } from "@/components/ui/dialog-blocks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { WorkspaceSection } from "@/components/provider/WorkspaceUI";
import { HowItWorksSteps, useHowItWorksRows } from "@/components/howItWorks/HowItWorksSection";
import {
  HOW_IT_WORKS_ICONS, HOW_IT_WORKS_LIMITS as L, defaultHowItWorks, hasHowItWorksProblems,
  howItWorksProblems, pickHowItWorks, type HowItWorksStep,
} from "@/lib/howItWorks";
import { cn } from "@/lib/utils";

/**
 * Overview → "How it works": the steps customers see on the business's page
 * and on its plan pages. One set for the whole business; a plan that works
 * differently can have its own. Until the business writes any, the pages show
 * the platform's default — said here, so nobody wonders where those came from.
 */

const BUSINESS = "business";

interface PlanLite { id: string; name: string }

function usePlans(providerId: string) {
  return useQuery({
    queryKey: ["how-it-works-plans", providerId],
    queryFn: async (): Promise<PlanLite[]> => {
      const { data, error } = await supabaseDb
        .from("provider_plans")
        .select("id,name,status,sort_order")
        .eq("provider_id", providerId)
        .is("parent_plan_id", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((p) => p.status !== "archived")
        .map((p) => ({ id: String(p.id), name: String(p.name ?? "Plan") }));
    },
  });
}

export function HowItWorksCard({ providerId }: { providerId: string }) {
  const { t } = useI18n();
  const rows = useHowItWorksRows(providerId);
  const plans = usePlans(providerId);
  const [open, setOpen] = useState(false);
  const [startScope, setStartScope] = useState<string>(BUSINESS);

  const business = pickHowItWorks(rows.data, null);
  const steps = business?.steps ?? defaultHowItWorks(t);
  const planNames = new Map((plans.data ?? []).map((p) => [p.id, p.name]));
  const ownPlans = (rows.data ?? []).filter((r) => r.plan_id && planNames.has(r.plan_id));

  const edit = (scope: string) => { setStartScope(scope); setOpen(true); };

  return (
    <WorkspaceSection
      title="How it works"
      subtitle="The steps customers see on your page and on every plan page."
      action={<Button size="sm" variant="secondary" onClick={() => edit(BUSINESS)}>Edit</Button>}
    >
      <div className="space-y-3">
        <span className={cn(
          "inline-flex rounded-full px-2.5 py-1 text-meta font-semibold",
          business ? "bg-primary/15 text-primary" : "bg-inset text-muted-foreground",
        )}>
          {business ? "Your own steps" : "EverySub's default steps"}
        </span>
        <ol className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-body text-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-inset text-meta font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 truncate">{s.title}</span>
            </li>
          ))}
        </ol>
        {ownPlans.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-meta text-muted-foreground">Own steps on:</span>
            {ownPlans.map((r) => (
              <button key={r.id} type="button" onClick={() => edit(r.plan_id!)}
                className="rounded-full bg-inset px-2.5 py-1 text-meta font-semibold text-foreground hover:bg-primary/15 hover:text-primary">
                {planNames.get(r.plan_id!)}
              </button>
            ))}
          </div>
        )}
      </div>
      <HowItWorksEditor
        providerId={providerId}
        open={open}
        onOpenChange={setOpen}
        initialScope={startScope}
        plans={plans.data ?? []}
      />
    </WorkspaceSection>
  );
}

const blank = (): HowItWorksStep => ({ title: "", text: null, icon: null });

export function HowItWorksEditor({ providerId, open, onOpenChange, initialScope, plans }: {
  providerId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialScope: string;
  plans: PlanLite[];
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const rows = useHowItWorksRows(providerId);
  const [scope, setScope] = useState(initialScope);
  const [draft, setDraft] = useState<HowItWorksStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const planId = scope === BUSINESS ? null : scope;

  const own = (rows.data ?? []).find((r) => (planId ? r.plan_id === planId : r.plan_id == null)) ?? null;
  /** What the page shows for this scope if nothing of its own is saved. */
  const inherited = useMemo(() => {
    if (planId) {
      const biz = pickHowItWorks(rows.data, null);
      if (biz) return { steps: biz.steps, label: "your business's steps" };
    }
    return { steps: defaultHowItWorks(t), label: "EverySub's default steps" };
  }, [planId, rows.data, t]);

  // Every opening, and every change of scope, starts from what that page shows now.
  const load = (s: string) => {
    const pid = s === BUSINESS ? null : s;
    const mine = (rows.data ?? []).find((r) => (pid ? r.plan_id === pid : r.plan_id == null));
    const fallback = pid ? (pickHowItWorks(rows.data, null)?.steps ?? defaultHowItWorks(t)) : defaultHowItWorks(t);
    setDraft((mine?.steps ?? fallback).map((x) => ({ ...x })));
    setDirty(false);
  };
  useEffect(() => {
    if (!open) return;
    setScope(initialScope);
    load(initialScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialScope, rows.isSuccess]);

  const problems = howItWorksProblems(draft);
  const blocked = hasHowItWorksProblems(problems);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["how-it-works", providerId] });
  const save = useMutation({
    mutationFn: async () => {
      const steps = draft.map((s) => ({ title: s.title.trim(), text: s.text?.trim() || null, icon: s.icon }));
      const { error } = await accountApi(`/account/providers/${providerId}/how-it-works`, {
        method: "PUT", body: JSON.stringify({ planId, steps }),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Saved — customers see the new steps now");
      await invalidate();
      setDirty(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the steps"),
  });
  const reset = useMutation({
    mutationFn: async () => {
      const q = planId ? `?planId=${encodeURIComponent(planId)}` : "";
      const { error } = await accountApi(`/account/providers/${providerId}/how-it-works${q}`, { method: "DELETE" });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(planId ? "This plan uses your business's steps again" : "Back to EverySub's default steps");
      await invalidate();
      setDraft(inherited.steps.map((x) => ({ ...x })));
      setDirty(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reset the steps"),
  });

  const update = (next: HowItWorksStep[]) => { setDraft(next); setDirty(true); };
  const patch = (i: number, p: Partial<HowItWorksStep>) => update(draft.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.length || from === to) return;
    const next = [...draft];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    update(next);
  };

  // Drag to reorder — by the grip only, so selecting text in a field never
  // starts a drag. Pointer events rather than HTML drag-and-drop, which never
  // fires on a touch screen; the arrows stay for keyboards.
  const listRef = useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const slotAt = (y: number) => {
    const items = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    const i = items.findIndex((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return i === -1 ? items.length - 1 : i;
  };
  const grip = (i: number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(i); setDropAt(i);
    },
    onPointerMove: (e: ReactPointerEvent) => { if (dragging === i) setDropAt(slotAt(e.clientY)); },
    onPointerUp: () => { if (dragging === i && dropAt != null) move(i, dropAt); setDragging(null); setDropAt(null); },
    onPointerCancel: () => { setDragging(null); setDropAt(null); },
  });

  const previewSteps = draft.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim(), text: s.text?.trim() || null }));

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && dirty && !window.confirm("Discard your changes?")) return;
        onOpenChange(o);
      }}
      title="How it works"
      description="Tell customers what happens after they buy, in your own words."
      className="sm:max-w-[960px]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {own && (
            <Button variant="ghost" className="sm:mr-auto" onClick={() => reset.mutate()} loading={reset.isPending} disabled={save.isPending}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {planId ? "Use the business's steps" : "Back to default"}
            </Button>
          )}
          <Button variant="secondary" className="sm:ml-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={blocked || reset.isPending || (!dirty && !!own)}>
            Save
          </Button>
        </div>
      }
    >
      {/* Its own grid: the editor on the left, the live preview beside it on a
          laptop and under it on a phone. */}
      <div className="grid min-w-0 gap-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <DialogBlock>
        <div className="space-y-1.5">
          <p className="text-body text-muted-foreground">Where</p>
          <Select
            value={scope}
            onValueChange={(v) => {
              if (dirty && !window.confirm("Discard your changes to these steps?")) return;
              setScope(v); load(v);
            }}
          >
            <SelectTrigger aria-label="Where these steps show"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={BUSINESS}>Whole business — your page and every plan</SelectItem>
              {plans.map((p) => {
                const has = (rows.data ?? []).some((r) => r.plan_id === p.id);
                return <SelectItem key={p.id} value={p.id}>{p.name}{has ? " · own steps" : ""}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {own
              ? planId ? "This plan has its own steps." : "Your own steps are live."
              : `Not written yet — customers see ${inherited.label}. Edit them below and save to make them yours.`}
          </p>
        </div>

        <ol ref={listRef} className="space-y-2">
          {draft.map((s, i) => {
            const Icon = s.icon ? HOW_IT_WORKS_ICONS[s.icon]?.icon : undefined;
            const err = problems.steps[i];
            return (
              <li
                key={i}
                className={cn(
                  "rounded-radius-md bg-inset p-3 transition-shadow",
                  dragging != null && dropAt === i && dragging !== i && "ring-2 ring-primary",
                  dragging === i && "opacity-60 ring-2 ring-primary/40",
                )}
              >
                {/* Phone: grip, icon and the buttons on one row, the fields full width
                    under them. Wider: the fields sit between them. */}
                <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
                  <div className="flex flex-row items-center gap-1 pt-2.5 sm:flex-col sm:pt-1">
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Drag step ${i + 1}`}
                      {...grip(i)}
                      className="cursor-grab touch-none select-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="h-5 w-5" />
                    </span>
                    <span className="text-meta font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  </div>

                  <IconPicker value={s.icon} onChange={(icon) => patch(i, { icon })} fallback={Icon} />

                  <div className="col-span-3 row-start-2 min-w-0 space-y-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                    <div className="relative">
                      <Input
                        value={s.title}
                        maxLength={L.title + 20}
                        onChange={(e) => patch(i, { title: e.target.value })}
                        placeholder="Step title, e.g. Pick your days"
                        aria-label={`Step ${i + 1} title`}
                        className={cn("pr-14", err && !s.title.trim() && "border-destructive")}
                      />
                      <Counter value={s.title.trim().length} max={L.title} className="absolute right-3 top-1/2 -translate-y-1/2" />
                    </div>
                    <div className="relative">
                      <Textarea
                        value={s.text ?? ""}
                        maxLength={L.text + 40}
                        rows={2}
                        onChange={(e) => patch(i, { text: e.target.value })}
                        placeholder="A short line on what happens (optional)"
                        aria-label={`Step ${i + 1} text`}
                        className="min-h-[64px] pb-6"
                      />
                      <Counter value={(s.text ?? "").trim().length} max={L.text} className="absolute bottom-2 right-3" />
                    </div>
                    {err && <p className="text-xs text-destructive">{err}</p>}
                  </div>

                  <div className="col-start-3 row-start-1 flex flex-row justify-self-end gap-1 sm:col-start-4 sm:flex-col">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Move down" disabled={i === draft.length - 1} onClick={() => move(i, i + 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove step"
                      disabled={draft.length <= L.minSteps} onClick={() => update(draft.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" size="sm" disabled={draft.length >= L.maxSteps} onClick={() => update([...draft, blank()])}>
            <Plus className="mr-1 h-4 w-4" /> Add a step
          </Button>
          <span className="text-xs text-muted-foreground">
            {problems.list ?? `${draft.length} of ${L.maxSteps} steps · drag or use the arrows to reorder`}
          </span>
        </div>
      </DialogBlock>

      {/* Live: exactly the block the plan page renders. */}
      <div className="space-y-2 lg:sticky lg:top-0">
        <p className="px-1 text-meta font-semibold text-muted-foreground">Preview</p>
        {previewSteps.length
          ? <HowItWorksSteps steps={previewSteps} title={t("howItWorks.title")} compact className="shadow-none" />
          : <p className="rounded-radius-lg bg-card p-4 text-body text-muted-foreground">Give a step a title to see it here.</p>}
      </div>
      </div>
    </ResponsiveDialog>
  );
}

function Counter({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <span className={cn("pointer-events-none text-[11px] tabular-nums", value > max ? "font-semibold text-destructive" : "text-muted-foreground/70", className)}>
      {value}/{max}
    </span>
  );
}

function IconPicker({ value, onChange, fallback: Current }: {
  value: string | null;
  onChange: (icon: string | null) => void;
  fallback?: ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ? `Icon: ${HOW_IT_WORKS_ICONS[value]?.label}` : "Choose an icon"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-offset-background hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {Current ? <Current className="h-5 w-5" /> : <Plus className="h-4 w-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[272px] p-2">
        <div className="grid grid-cols-6 gap-1">
          {Object.entries(HOW_IT_WORKS_ICONS).map(([key, { icon: I, label }]) => (
            <button
              key={key}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => { onChange(key); setOpen(false); }}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-radius-md text-foreground hover:bg-inset",
                value === key && "bg-primary/15 text-primary",
              )}
            >
              <I className="h-5 w-5" />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { onChange(null); setOpen(false); }}
          className="mt-1 w-full rounded-radius-md px-2 py-1.5 text-left text-meta text-muted-foreground hover:bg-inset">
          No icon — show the step's number
        </button>
      </PopoverContent>
    </Popover>
  );
}
