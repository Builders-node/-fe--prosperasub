/**
 * Plain-English-keyed translation for the whole app.
 *
 *   tr("Save changes")                       → "Guardar cambios" on /es
 *   tr("Hi, {name}", { name })               → "Hola, Ana"
 *   trx("Paid by {who}", { who: <b>Ana</b> }) → a node, when a slot holds JSX
 *
 * The English text is the key, so a string reads the same in the component as
 * on screen, and a phrase with no Spanish yet simply stays in English instead
 * of showing a key. The Spanish lives in src/i18n/es.ts.
 *
 * The language is read once, when the app opens: switching language reloads
 * the page onto the /es (or plain) address — see AppDropdownLanguageItem — so
 * strings computed at module load (labels in config arrays) are right too.
 */
import { createElement, Fragment, type ReactNode } from "react";
import { es as esLocale } from "date-fns/locale";
import { inSpanishUrl } from "@/lib/seo/lang";

export type Lang = "en" | "es";

export const LANGUAGE_STORAGE_KEY = "prospera_language";

function detectLanguage(): Lang {
  if (typeof window === "undefined") return "en";
  // An /es address is Spanish, whatever was chosen before.
  if (inSpanishUrl()) return "es";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch { /* private mode */ }
  const preferred = [navigator.language, ...(navigator.languages ?? [])];
  return preferred.some((l) => l?.toLowerCase().startsWith("es")) ? "es" : "en";
}

/** The language this page load runs in. */
export const LANG: Lang = detectLanguage();
export const isEs = LANG === "es";

/** For toLocaleDateString / Intl date formatting. */
export const DATE_LOCALE = isEs ? "es-HN" : "en-US";

/** For date-fns `format(d, "…", { locale: dfLocale })`. */
export const dfLocale = isEs ? esLocale : undefined;

/**
 * The Spanish dictionary is ~300 KB, so it is a chunk of its own, fetched only
 * on a Spanish page load — main.tsx awaits loadSpanish() before it imports the
 * app, so every tr() (module-level ones included) already sees it.
 */
let ES: Record<string, string> = {};
export async function loadSpanish(): Promise<void> {
  if (!isEs) return;
  try {
    ES = (await import("@/i18n/es")).ES;
  } catch {
    // A failed chunk leaves the page in English rather than blank.
  }
}

type Vars = Record<string, unknown>;

const fill = (template: string, vars?: Vars) =>
  vars ? template.replace(/\{(\w+)\}/g, (whole, k) => (k in vars ? (vars[k] == null || typeof vars[k] === "boolean" ? "" : String(vars[k])) : whole)) : template;

/** The phrase in the current language, slots filled. */
export function tr(text: string, vars?: Vars): string {
  const phrase = isEs ? ES[text] ?? text : text;
  return fill(phrase, vars);
}

/** Like tr, for JSX children whose slots may hold elements. */
export function trx(text: string, vars: Vars): ReactNode {
  const phrase = isEs ? ES[text] ?? text : text;
  const values = Object.values(vars);
  if (values.every((v) => v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
    return fill(phrase, vars);
  }
  const parts: ReactNode[] = [];
  let last = 0;
  phrase.replace(/\{(\w+)\}/g, (whole, k: string, at: number) => {
    if (at > last) parts.push(phrase.slice(last, at));
    parts.push(k in vars ? (vars[k] as ReactNode) : whole);
    last = at + whole.length;
    return whole;
  });
  if (last < phrase.length) parts.push(phrase.slice(last));
  return createElement(Fragment, null, ...parts);
}

/**
 * Counted nouns ("3 weeks", "1 person") for the few units the app itself
 * names. English adds an "s"; Spanish needs its own plural, so the units are
 * listed. Accepts the English noun or its Spanish singular (periodNoun()
 * already returns the translated word on /es).
 */
const NOUNS_ES: Record<string, [string, string]> = {
  week: ["semana", "semanas"], month: ["mes", "meses"], quarter: ["trimestre", "trimestres"],
  year: ["año", "años"], period: ["periodo", "periodos"], portion: ["porción", "porciones"],
  person: ["persona", "personas"], visit: ["visita", "visitas"], day: ["día", "días"],
  session: ["sesión", "sesiones"], meal: ["comida", "comidas"], vehicle: ["vehículo", "vehículos"],
};
const esNoun = (noun: string): [string, string] | undefined =>
  NOUNS_ES[noun] ?? Object.values(NOUNS_ES).find(([one]) => one === noun);

/** "weeks", "people" — the plural of a unit noun, in the page's language. */
export function nounPlural(noun: string): string {
  if (isEs) return esNoun(noun)?.[1] ?? noun;
  return noun === "person" ? "people" : `${noun}s`;
}

/** "3 weeks", "1 person", "2 porciones". */
export function countNoun(n: number, noun: string): string {
  if (n === 1) return `1 ${isEs ? esNoun(noun)?.[0] ?? noun : noun}`;
  return `${n} ${nounPlural(noun)}`;
}
