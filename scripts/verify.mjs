// Pre-build gate — runs before `vite build` (locally and on Vercel, which runs
// `npm run build`). Catches the two failure classes that vite/esbuild ship
// silently:
//   1. Type errors ABOVE the known baseline — a genuinely new tsc error.
//   2. Rules-of-Hooks violations — a hook after an early return white-screens
//      the page at runtime; tsc and vite never see it, only eslint does. This
//      is the #300/#310 crash family that kept reaching production.
// Cosmetic eslint errors are intentionally NOT gated (they'd block deploys for
// no safety gain); only the crash-causing hook rule is.
import { execSync } from "node:child_process";

// Pre-existing tsc errors (mostly TS1320 await-on-thenable noise). Ratchet this
// DOWN as they're fixed; never up. A PR that adds an error fails here.
const TSC_BASELINE = 10;

function run(cmd) {
  // 64MB buffer — eslint --format=json over the whole src tree blows the 1MB
  // default and would otherwise arrive truncated.
  const opts = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 };
  try {
    return { code: 0, out: execSync(cmd, opts) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` };
  }
}

console.log("▶ verify: type-check…");
const tsc = run("npx tsc -p tsconfig.app.json --noEmit");
const tscErrors = (tsc.out.match(/error TS/g) || []).length;
console.log(`  ${tscErrors} type error(s) (baseline ${TSC_BASELINE})`);
if (tscErrors > TSC_BASELINE) {
  console.error(tsc.out);
  console.error(`\n✖ Type errors rose to ${tscErrors} (baseline ${TSC_BASELINE}). Fix the new error above, then rebuild.`);
  process.exit(1);
}

console.log("▶ verify: rules-of-hooks…");
const lint = run("npx eslint src --format=json");
let report;
try {
  report = JSON.parse((lint.out || "").trim() || "[]");
} catch {
  // eslint couldn't produce JSON — a config/parse failure, not lint findings.
  console.error(lint.out);
  console.error("\n✖ eslint failed to run (see above).");
  process.exit(1);
}
const hookErrors = [];
for (const f of report) {
  for (const m of f.messages || []) {
    if (m.ruleId === "react-hooks/rules-of-hooks") {
      hookErrors.push(`   ${f.filePath}:${m.line}:${m.column}  ${m.message}`);
    }
  }
}
if (hookErrors.length) {
  console.error("✖ Rules-of-Hooks violations — these white-screen the page at runtime (tsc & vite miss them):");
  console.error(hookErrors.join("\n"));
  console.error("\nHoist every hook above any early return, then rebuild.");
  process.exit(1);
}

// ─── Design system ratchet ─────────────────────────────────────────────────
// DESIGN.md: one accent, status through --positive/--attention/--negative,
// type through the roles (text-heading / text-title / text-meta), radius
// through rounded-radius-*, width through AppContainer, no gradients, no
// shadow but shadow-figma. Each count may only go DOWN — lower the baseline
// when you migrate a page; a change that adds a violation fails here.
// The UI kit and a few genuine exceptions (status pill, payment brand marks,
// drawn banners, dietary tags) are allowed.
console.log("▶ verify: design system…");
const { readFileSync, readdirSync, statSync } = await import("node:fs");
const { join } = await import("node:path");
const DESIGN_ALLOW = ["/components/ui/", "StatusPill.tsx", "PaymentMethodTiles.tsx", "categoryBannerArt.tsx", "foodDietaryTags.ts", "PaymentMethodBadge.tsx", "/main.tsx"];
const DESIGN_RULES = {
  palette:   { re: /\b(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:red|green|emerald|amber|orange|yellow|blue|sky|violet|purple|rose|cyan|lime|teal|pink|indigo|fuchsia)-\d{2,3}\b/g, base: 23, fix: "use text-positive / text-attention / text-negative, or a token" },
  shadow:    { re: /\bshadow-(?!figma\b|none\b)[a-z0-9]/g, base: 0, fix: "the only shadow is shadow-figma" },
  gradient:  { re: /\bbg-gradient-/g, base: 7, fix: "no gradients (DESIGN.md)" },
  pxText:    { re: /\btext-\[\d+px\]/g, base: 357, fix: "use text-heading / text-title / text-meta" },
  tracking:  { re: /\btracking-\[/g, base: 100, fix: "the type roles carry their tracking" },
  rawRadius: { re: /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/g, base: 29, fix: "use rounded-radius-*" },
  container: { re: /max-w-\[1280px\]/g, base: 5, fix: "use AppContainer / .app-container" },
  // A Button's height and shape come from its size (sm 36 · default 44 · lg 48,
  // all pills). A per-call h-* or rounded-full is how seven heights happened.
  // Fields are a filled surface (input.tsx FIELD_SURFACE / fieldClass) — never a rimmed box.
  fieldBorder: { re: /\bborder-input\b/g, base: 0, fix: "use fieldClass from components/ui/input" },
  buttonShape: { re: /<Button\b[^>]*?className="[^"]*\b(?:rounded-full|h-(?:7|9|10|11|12|14))\b/g, base: 0, fix: "use Button size=\"sm|default|lg\"" },
};
const designFiles = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !DESIGN_ALLOW.some((a) => p.includes(a))) designFiles.push(p);
  }
})("src");
const designCounts = Object.fromEntries(Object.keys(DESIGN_RULES).map((k) => [k, 0]));
for (const p of designFiles) {
  const src = readFileSync(p, "utf8");
  for (const [k, r] of Object.entries(DESIGN_RULES)) designCounts[k] += (src.match(r.re) || []).length;
}
const designOver = Object.entries(DESIGN_RULES).filter(([k, r]) => designCounts[k] > r.base);
console.log("  " + Object.entries(designCounts).map(([k, n]) => `${k} ${n}/${DESIGN_RULES[k].base}`).join(" · "));
if (designOver.length) {
  for (const [k, r] of designOver) console.error(`✖ ${k}: ${designCounts[k]} (baseline ${r.base}) — ${r.fix}`);
  console.error("\nA change added a design-system violation. Fix it, then rebuild.");
  process.exit(1);
}

console.log("✔ verify passed\n");
