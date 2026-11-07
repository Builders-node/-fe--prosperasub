import { Link } from "react-router-dom";
import { UserLayout } from "@/components/layout/UserLayout";

/**
 * Terms and Privacy share one shape: a title block with the date it took
 * effect, then numbered sections, each a card — the account page's layering
 * (grey page, white blocks), readable at phone width without zooming.
 */
export interface LegalSection {
  title: string;
  /** Paragraphs; a string starting with "• " renders as a list item. */
  body: string[];
}

export const LEGAL_CONTACT = {
  email: "support@prosperasub.com",
  whatsapp: "+504 9706-7865",
  whatsappHref: "https://wa.me/50497067865",
};

export function LegalPage({ title, updated, intro, sections, other }: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  /** The sibling document, linked at the bottom. */
  other: { label: string; to: string };
}) {
  return (
    <UserLayout title={title} showBackButton allowGuest showBottomNav={false}>
      <div className="mx-auto max-w-[760px] space-y-1 py-4">
        <section className="rounded-radius-lg bg-card p-4 md:p-6">
          <h1 className="text-heading font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-meta text-muted-foreground">Last updated {updated}</p>
          <p className="mt-3 text-body text-muted-foreground">{intro}</p>
        </section>

        {sections.map((s, i) => (
          <section key={s.title} className="rounded-radius-lg bg-card p-4 md:p-6">
            <h2 className="text-title font-semibold text-foreground">{i + 1}. {s.title}</h2>
            <div className="mt-2 space-y-2">
              {groupLists(s.body).map((part, j) =>
                Array.isArray(part) ? (
                  <ul key={j} className="list-disc space-y-1 pl-5 text-body text-muted-foreground">
                    {part.map((li) => <li key={li}>{li}</li>)}
                  </ul>
                ) : (
                  <p key={j} className="text-body text-muted-foreground">{part}</p>
                ),
              )}
            </div>
          </section>
        ))}

        <section className="rounded-radius-lg bg-card p-4 md:p-6">
          <h2 className="text-title font-semibold text-foreground">Contact</h2>
          <p className="mt-2 text-body text-muted-foreground">
            Email <a className="text-primary underline-offset-2 hover:underline" href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>,
            WhatsApp <a className="text-primary underline-offset-2 hover:underline" href={LEGAL_CONTACT.whatsappHref} target="_blank" rel="noreferrer">{LEGAL_CONTACT.whatsapp}</a>,
            or the <Link className="text-primary underline-offset-2 hover:underline" to="/support">support form</Link>.
          </p>
          <p className="mt-3 text-body">
            <Link className="text-primary underline-offset-2 hover:underline" to={other.to}>{other.label} →</Link>
          </p>
        </section>
      </div>
    </UserLayout>
  );
}

/** Consecutive "• " lines become one list. */
function groupLists(body: string[]): Array<string | string[]> {
  const out: Array<string | string[]> = [];
  for (const line of body) {
    if (line.startsWith("• ")) {
      const last = out[out.length - 1];
      if (Array.isArray(last)) last.push(line.slice(2));
      else out.push([line.slice(2)]);
    } else out.push(line);
  }
  return out;
}
