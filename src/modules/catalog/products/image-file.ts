/**
 * Checks an uploaded product image by its actual contents (the first bytes),
 * not by its file name or the type the browser claims.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageKind = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
};

export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => at(i) === b)) {
    return { mime: "image/png", ext: "png" };
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export type ImageCheck = { ok: true; kind: ImageKind } | { ok: false; error: string };

export function checkImage(size: number, firstBytes: Uint8Array): ImageCheck {
  if (size === 0) return { ok: false, error: "Choose an image file" };
  if (size > MAX_IMAGE_BYTES) return { ok: false, error: "The image must be 5 MB or smaller" };
  const kind = detectImageKind(firstBytes);
  if (!kind) return { ok: false, error: "Use a JPEG, PNG or WebP image" };
  return { ok: true, kind };
}

/** Storage path, always built from verified IDs: "<business>/<product>/<random>.<ext>". */
export function productImagePath(
  businessId: string,
  productId: string,
  fileId: string,
  ext: string,
) {
  return `${businessId}/${productId}/${fileId}.${ext}`;
}
