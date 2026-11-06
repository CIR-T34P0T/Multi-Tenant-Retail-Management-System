import { describe, expect, it } from "vitest";
import {
  MODULES,
  PILOT_ENABLED_MODULES,
  checkModuleChange,
  getNavigation,
  type ModuleCode,
  type OptionalModuleCode,
} from "./registry";

const none = new Set<OptionalModuleCode>();
const titles = (enabled: ReadonlySet<OptionalModuleCode>) =>
  getNavigation(enabled).flatMap((g) => g.items.map((i) => i.title));

describe("module registry", () => {
  it("has unique module codes and menu links", () => {
    const codes = MODULES.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    const hrefs = MODULES.flatMap((m) => m.nav.map((n) => n.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("only references modules that exist", () => {
    const codes = new Set<ModuleCode>(MODULES.map((m) => m.code));
    for (const m of MODULES) for (const dep of m.requires) expect(codes.has(dep)).toBe(true);
  });

  it("has no dependency cycles", () => {
    const visit = (code: ModuleCode, path: ModuleCode[]): void => {
      expect(path).not.toContain(code);
      const m = MODULES.find((x) => x.code === code)!;
      m.requires.forEach((d) => visit(d, [...path, code]));
    };
    MODULES.forEach((m) => visit(m.code, []));
  });

  it("core modules never require optional modules", () => {
    const core = MODULES.filter((m) => m.kind === "core");
    for (const m of core) {
      for (const dep of m.requires) {
        expect(MODULES.find((x) => x.code === dep)!.kind).toBe("core");
      }
    }
  });
});

describe("navigation", () => {
  it("shows only core menus when every optional module is off", () => {
    expect(titles(none)).toEqual([
      "Dashboard",
      "Sections",
      "Products",
      "Inventory",
      "Reports",
      "Settings",
    ]);
  });

  it("adds enabled optional modules for the pilot shop", () => {
    const t = titles(PILOT_ENABLED_MODULES);
    expect(t).toEqual(
      expect.arrayContaining(["Sales", "Purchases", "Suppliers", "Customers", "Credit"]),
    );
    expect(t).not.toContain("Accounting");
    expect(t).not.toContain("Expenses");
  });
});

describe("enabling and disabling modules", () => {
  it("refuses to disable a core module", () => {
    expect(checkModuleChange("inventory", false, none).ok).toBe(false);
  });

  it("requires sales and customers before credit", () => {
    const r = checkModuleChange("credit", true, new Set(["sales"]));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("Customers") });
    expect(checkModuleChange("credit", true, new Set(["sales", "customers"])).ok).toBe(true);
  });

  it("blocks disabling sales while credit is on", () => {
    const r = checkModuleChange("sales", false, PILOT_ENABLED_MODULES);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("Credit") });
  });

  it("allows disabling a module nothing depends on", () => {
    expect(checkModuleChange("credit", false, PILOT_ENABLED_MODULES).ok).toBe(true);
    expect(checkModuleChange("suppliers", false, PILOT_ENABLED_MODULES).ok).toBe(true);
  });
});
