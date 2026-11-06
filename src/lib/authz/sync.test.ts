import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULES } from "@/modules/registry";
import { PERMISSIONS } from "./permissions";

/**
 * The module list and permission catalogue exist twice: in the database
 * (reference-data migration) and in TypeScript. These tests fail if they drift.
 */
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261106100200_reference_data.sql"),
  "utf8",
);

function section(start: string, end: string) {
  return sql.slice(sql.indexOf(start), sql.indexOf(end));
}

describe("database ↔ TypeScript sync", () => {
  it("modules match the registry (codes, core flag, requirements)", () => {
    const rows = [
      ...section("insert into public.modules", "insert into public.permissions").matchAll(
        /\('([a-z_]+)',\s*'[^']*',\s*(true|false),\s*'\{([^}]*)\}'/g,
      ),
    ].map(([, code, core, req]) => ({
      code,
      core: core === "true",
      requires: req ? req.split(",").sort() : [],
    }));

    const registry = MODULES.map((m) => ({
      code: m.code,
      core: m.kind === "core",
      requires: [...m.requires].sort(),
    }));

    expect(rows.length).toBe(13);
    expect(rows.sort((a, b) => a.code.localeCompare(b.code))).toEqual(
      registry.sort((a, b) => a.code.localeCompare(b.code)),
    );
  });

  it("permission catalogue matches", () => {
    const rows = [
      ...section("insert into public.permissions", "insert into public.role_templates").matchAll(
        /\('([a-z_]+\.[a-z_]+\.[a-z_]+)',\s*'([a-z_]+)',\s*'(?:[^']|'')*',\s*(true|false)\)/g,
      ),
    ].map(([, code, module, sensitive]) => [code, { module, sensitive: sensitive === "true" }]);

    expect(rows.length).toBeGreaterThan(40);
    expect(Object.fromEntries(rows)).toEqual(PERMISSIONS);
  });

  it("every permission belongs to a registered module", () => {
    const codes = new Set(MODULES.map((m) => m.code as string));
    for (const p of Object.values(PERMISSIONS)) expect(codes.has(p.module)).toBe(true);
  });
});
