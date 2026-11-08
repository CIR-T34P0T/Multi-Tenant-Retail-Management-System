import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, checkImage, detectImageKind, productImagePath } from "./image-file";

const bytes = (...b: number[]) => new Uint8Array(b);
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");

describe("product image checks", () => {
  it("recognises JPEG, PNG and WebP by their contents", () => {
    expect(detectImageKind(jpeg)?.mime).toBe("image/jpeg");
    expect(detectImageKind(png)?.ext).toBe("png");
    expect(detectImageKind(webp)?.mime).toBe("image/webp");
  });

  it("rejects other files even if named like images", () => {
    expect(detectImageKind(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(detectImageKind(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectImageKind(bytes())).toBeNull();
  });

  it("limits size and requires a file", () => {
    expect(checkImage(0, jpeg)).toEqual({ ok: false, error: "Choose an image file" });
    expect(checkImage(MAX_IMAGE_BYTES + 1, jpeg).ok).toBe(false);
    expect(checkImage(1000, jpeg).ok).toBe(true);
  });

  it("builds paths from IDs only", () => {
    expect(productImagePath("b1", "p1", "f1", "png")).toBe("b1/p1/f1.png");
  });
});
