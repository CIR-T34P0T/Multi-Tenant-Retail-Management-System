import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_IMAGE_BYTES } from "./image-file";

/**
 * Product image storage (private bucket).
 *
 * Uses the service-role key, which bypasses database security, so EVERY
 * caller must first prove — with the signed-in user's own client, under
 * Row-Level Security — that the user may see (for links) or edit (for
 * uploads) the product. Paths are built only from those verified IDs.
 * See docs/14-security-model.md §5.
 */
export const PRODUCT_IMAGE_BUCKET = "product-images";
const LINK_SECONDS = 60 * 60;

let bucketReady: Promise<void> | null = null;

/** Creates the private bucket on first use (works the same locally and in production). */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const admin = createAdminClient();
    const existing = await admin.storage.getBucket(PRODUCT_IMAGE_BUCKET);
    if (!existing.error) return;
    const created = await admin.storage.createBucket(PRODUCT_IMAGE_BUCKET, {
      public: false,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (created.error && !/already exists/i.test(created.error.message)) {
      throw new Error(`Image storage is not available: ${created.error.message}`);
    }
  })().catch((e) => {
    bucketReady = null;
    throw e;
  });
  return bucketReady;
}

export async function uploadProductImage(path: string, body: Blob, contentType: string) {
  await ensureBucket();
  const { error } = await createAdminClient()
    .storage.from(PRODUCT_IMAGE_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`Could not store the image: ${error.message}`);
}

/** Best effort: a leftover file is harmless, so failures are only logged. */
export async function deleteProductImage(path: string) {
  try {
    const { error } = await createAdminClient().storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
    if (error) console.error("Could not delete old product image", error.message);
  } catch (e) {
    console.error("Could not delete old product image", e);
  }
}

/** Temporary links (1 hour) for images the caller has ALREADY been allowed to see. */
export async function signedImageUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  try {
    const { data, error } = await createAdminClient()
      .storage.from(PRODUCT_IMAGE_BUCKET)
      .createSignedUrls(paths, LINK_SECONDS);
    if (error) return out;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) out.set(item.path, item.signedUrl);
    }
  } catch {
    // Storage unavailable: pages still work, just without pictures.
  }
  return out;
}
