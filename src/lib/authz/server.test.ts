import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { ForbiddenError, getPermissions, requirePermission } = await import("./server");

type RpcResult = { data: unknown; error: { message: string } | null };
const fakeClient = (result: RpcResult) =>
  ({ rpc: vi.fn().mockResolvedValue(result) }) as unknown as Parameters<typeof getPermissions>[0];

describe("server permission helpers", () => {
  it("returns only known permission codes", async () => {
    const perms = await getPermissions(
      fakeClient({ data: ["inventory.stock.view", "made.up.permission"], error: null }),
      "b1",
    );
    expect([...perms]).toEqual(["inventory.stock.view"]);
  });

  it("allows when every required permission is held", async () => {
    const client = fakeClient({
      data: ["inventory.stock.view", "pricing.price.view"],
      error: null,
    });
    await expect(
      requirePermission(client, "b1", "inventory.stock.view", "pricing.price.view"),
    ).resolves.toBeDefined();
  });

  it("refuses when any required permission is missing", async () => {
    const client = fakeClient({ data: ["inventory.stock.view"], error: null });
    await expect(requirePermission(client, "b1", "pricing.price.update")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("treats a non-member (empty list) as having nothing", async () => {
    await expect(
      requirePermission(fakeClient({ data: [], error: null }), "b1", "dashboard.overview.view"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("surfaces database errors instead of silently allowing", async () => {
    await expect(
      getPermissions(fakeClient({ data: null, error: { message: "boom" } }), "b1"),
    ).rejects.toThrow("boom");
  });
});
