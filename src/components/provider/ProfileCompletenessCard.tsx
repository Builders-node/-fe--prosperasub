import { Check, Circle } from "lucide-react";
import { profileCompleteness } from "@/lib/providerProfile";
import type { UniversalProviderRow } from "@/components/provider/UniversalInfoTab";

/**
 * What is still missing from this business's public profile.
 *
 * Sits above the profile editor, so the answer to "what should I fill in?" is
 * on the same screen as the fields. Disappears at 100% — a green banner
 * congratulating somebody every time they open their workspace is noise.
 */
export function ProfileCompletenessCard({ provider }: { provider: UniversalProviderRow }) {
  const { missing, done, total, percent } = profileCompleteness(provider);
  if (!missing.length) return null;

  return (
    <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[20px] font-semibold leading-[26px] text-foreground">
          Your profile is {percent}% complete
        </h2>
        <span className="text-[16px] leading-[22px] text-muted-foreground">{done} of {total} done</span>
      </div>
      <p className="mt-1 text-[16px] leading-[22px] text-muted-foreground">
        This is what a customer sees before they buy. Edit it below.
      </p>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {missing.map((f) => (
          <li key={f.key} className="flex items-start gap-2.5 rounded-radius-md bg-inset p-3">
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
            <span className="min-w-0">
              <span className="block text-[16px] leading-[22px] text-foreground">{f.label}</span>
              <span className="block text-[14px] leading-[18px] text-muted-foreground">{f.why}</span>
            </span>
          </li>
        ))}
      </ul>

      {done > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[14px] leading-[18px] text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-primary" />
          {done} already filled in
        </p>
      )}
    </section>
  );
}
