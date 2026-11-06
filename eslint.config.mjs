import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Optional modules (docs/07-module-dependency-map.md §6). Core code must never
 * import them, so disabling a module can never break inventory.
 */
const OPTIONAL_MODULES = [
  "sales",
  "purchases",
  "suppliers",
  "customers",
  "credit",
  "expenses",
  "accounting",
  "analytics",
];
const CORE_MODULES = ["core", "catalog", "pricing", "inventory", "dashboard"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Core modules and shared libraries may not depend on optional modules.
    files: [
      ...CORE_MODULES.map((m) => `src/modules/${m}/**/*.{ts,tsx}`),
      "src/lib/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: OPTIONAL_MODULES.map((m) => `@/modules/${m}/*`),
              message:
                "Core code must not import optional modules. Use the event outbox or a registered extension point instead (docs/07).",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/components/ui/**"]),
]);

export default eslintConfig;
