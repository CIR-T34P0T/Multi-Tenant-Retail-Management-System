import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Optional multi-line description with its error message. */
export function DescriptionField({
  id,
  defaultValue,
  errors,
  placeholder,
}: {
  id: string;
  defaultValue?: string;
  errors?: string[];
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        Description <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <Textarea
        id={id}
        name="description"
        rows={2}
        maxLength={300}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={errors?.length ? true : undefined}
      />
      {errors?.length ? (
        <p className="text-destructive text-sm" role="alert">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
