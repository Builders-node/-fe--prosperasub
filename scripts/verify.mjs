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
const TSC_BASELINE = 17;

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

console.log("✔ verify passed\n");
