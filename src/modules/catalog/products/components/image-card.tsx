"use client";

import { useTransition } from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeImage, uploadImage } from "../actions";

export function ImageCard({
  productId,
  productName,
  imageUrl,
  hasImage,
  canManage,
}: {
  productId: string;
  productName: string;
  imageUrl: string | null;
  hasImage: boolean;
  canManage: boolean;
}) {
  const [state, action, pending] = useFormAction(uploadImage.bind(null, productId), {
    resetOnSuccess: true,
  });
  const [removing, startRemove] = useTransition();

  return (
    <div className="grid gap-3 self-start rounded-lg border p-4">
      <h2 className="font-semibold">Image</h2>
      <div className="bg-muted flex aspect-square w-full max-w-64 items-center justify-center overflow-hidden rounded-md">
        {imageUrl ? (
          // A private, short-lived link from our own storage; Next's image optimiser
          // would need to cache it, so a plain <img> is used on purpose.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={productName} className="size-full object-cover" />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-1 text-sm">
            <ImageIcon className="size-8" aria-hidden />
            {hasImage ? "Image unavailable right now" : "No image"}
          </div>
        )}
      </div>
      {canManage ? (
        <>
          <form onSubmit={action} className="grid gap-2">
            <FormAlert state={state} />
            <Label htmlFor="product-image">{hasImage ? "Replace image" : "Add an image"}</Label>
            <Input
              id="product-image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="h-11 md:h-9"
            />
            <p className="text-muted-foreground text-xs">JPEG, PNG or WebP, up to 5 MB.</p>
            {state.fieldErrors?.image ? (
              <p className="text-destructive text-sm" role="alert">
                {state.fieldErrors.image.join(" ")}
              </p>
            ) : null}
            <SubmitButton pending={pending} variant="secondary" className="h-11 w-fit md:h-9">
              Upload
            </SubmitButton>
          </form>
          {hasImage ? (
            <Button
              variant="ghost"
              className="h-11 w-fit md:h-9"
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  const r = await removeImage(productId);
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.message);
                })
              }
            >
              <Trash2 /> Remove image
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
