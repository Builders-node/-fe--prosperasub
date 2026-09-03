import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",

      /**
       * A feature is reached through its door, never through its rooms.
       *
       * `src/features/<name>/index.ts` says what the rest of the app may use;
       * everything else in there is private. Without this the boundary is a
       * convention, and a convention lasts until the first hurry — which is
       * how a car component ended up in the shared folder, a car date-picker
       * in `patterns/`, and a car type imported by four unrelated screens.
       *
       * Inside a feature, files import each other relatively, so this rule
       * cannot fire on the feature's own code.
       */
      "no-restricted-imports": ["error", {
        patterns: [{
          // `pages/` is open on purpose: the router lazy-imports each screen
          // directly, and going through the index would pull a whole feature
          // into one chunk and undo the code splitting. A page is also the
          // least dangerous thing to depend on — it renders, it is not
          // machinery. Everything else is the feature's own business.
          group: [
            "@/features/*/components/*",
            "@/features/*/hooks/*",
            "@/features/*/lib/*",
            "@/features/*/types/*",
            // legacy/ is the same boundary for the verticals that predate the
            // universal model. They are on their way out, which is exactly why
            // the rest of the app should reach them through one door: fewer
            // doors to close when the tables finally go.
            "@/legacy/*/components/*",
            "@/legacy/*/hooks/*",
            "@/legacy/*/lib/*",
            "@/legacy/*/types/*",
          ],
          message:
            "Import a feature through its index — @/features/<name> — not its internals. " +
            "If you need something that is not exported there, export it there.",
        }],
      }],
    },
  },
);
