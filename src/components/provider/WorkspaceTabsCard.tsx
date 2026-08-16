import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The owner's tab strip: a card holding one segmented control.
 *
 * The workspace used to spread its tabs edge to edge in equal columns, which
 * meant every service got a different tab WIDTH and a strip that squeezed
 * "Operations" into two letters as soon as a sixth tab appeared. The design
 * gives labels their natural width and scrolls the track instead, so a
 * business with six tabs reads exactly like one with four.
 *
 * Icons are dropped on purpose: at 16px semibold the words are the label, and
 * an icon per tab was what forced the abbreviations in the first place.
 */
export function WorkspaceTabsCard({ tabs }: {
  tabs: Array<{ value: string; label: string }>;
}) {
  return (
    <section className="rounded-radius-lg bg-card p-4">
      <TabsList variant="segment">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} variant="segment">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </section>
  );
}
