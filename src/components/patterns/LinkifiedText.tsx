import { Fragment } from "react";

/**
 * Provider-written prose with the two things providers actually paste into it
 * made tappable: a phone number and a link.
 *
 * Descriptions are the provider's own words, and today they end with lines
 * like "WhatsApp: +1 (469) 670-3443" — which the page rendered as dead text a
 * customer had to copy by hand. The right home for a contact is the provider's
 * profile, but the words are theirs; the least the page can do is make them
 * work.
 *
 * Deliberately narrow, because false positives here would turn prices into
 * links: a phone must START with "+" (that alone excludes "$40.00 / week" and
 * "2026-09-02"), and a link must carry its protocol.
 */

const TOKEN = /(\+\d[\d\s().-]{6,}\d)|(https?:\/\/\S+)/g;

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^\+\d[\d\s().-]{6,}\d$/.test(part)) {
          const digits = part.replace(/\D/g, "");
          return (
            <a
              key={i}
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {part}
            </a>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {part}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
