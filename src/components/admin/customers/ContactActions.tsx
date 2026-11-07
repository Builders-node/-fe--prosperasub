import { Mail, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizePhone } from "@/components/patterns/CustomerPhone";
import { cn } from "@/lib/utils";

/**
 * Call · WhatsApp · Email for one customer, as 40px icon buttons.
 *
 * "Who is this customer and how do I reach them" took three to five screens;
 * the answer is now on the row. Each button is a real link (tel:, wa.me,
 * mailto:) with an aria-label naming the person, so it works by keyboard and
 * screen reader and never depends on a hover tooltip. Clicks stop propagating
 * because the row around them may itself be clickable.
 *
 * Renders nothing for a channel we hold no value for — a disabled phone icon
 * on every email-only account would be noise, not information.
 */
interface Props {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  className?: string;
}

export function ContactActions({ name, phone, whatsapp, email, className }: Props) {
  const tel = normalizePhone(phone);
  const wa = normalizePhone(whatsapp ?? phone);
  const mail = typeof email === "string" && email.includes("@") ? email.trim() : null;
  if (!tel && !wa && !mail) return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {tel && (
        <Button asChild variant="ghost" size="icon">
          <a href={`tel:${tel.replace(/\s+/g, "")}`} onClick={stop} aria-label={`Call ${name}`}>
            <Phone />
          </a>
        </Button>
      )}
      {wa && (
        <Button asChild variant="ghost" size="icon">
          <a
            href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            aria-label={`WhatsApp ${name}`}
          >
            <MessageCircle />
          </a>
        </Button>
      )}
      {mail && (
        <Button asChild variant="ghost" size="icon">
          <a href={`mailto:${mail}`} onClick={stop} aria-label={`Email ${name}`}>
            <Mail />
          </a>
        </Button>
      )}
    </div>
  );
}
