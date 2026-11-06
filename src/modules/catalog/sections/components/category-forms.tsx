"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { initialActionResult, type ActionResult } from "@/lib/action-result";
import { createCategory, updateCategory } from "../actions";
import { DescriptionField } from "./description-field";

export function NewCategoryForm({ sectionId }: { sectionId: string }) {
  const [state, action, pending] = useActionState(
    createCategory.bind(null, sectionId),
    initialActionResult,
  );
  return (
    <form action={action} className="grid gap-4 rounded-lg border p-4" noValidate>
      <h2 className="font-semibold">Add a category</h2>
      <FormAlert state={state} />
      <FormField
        id="new-category-name"
        label="Category name"
        name="name"
        required
        maxLength={60}
        placeholder="e.g. Rice"
        errors={state.fieldErrors?.name}
      />
      <DescriptionField id="new-category-description" errors={state.fieldErrors?.description} />
      <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
        Add category
      </SubmitButton>
    </form>
  );
}

export type SectionOption = { id: string; name: string };

export function EditCategoryDialog({
  category,
  sections,
}: {
  category: { id: string; name: string; description: string; sectionId: string };
  /** Active sections the category may move to (its current section is always included). */
  sections: SectionOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await updateCategory(category.id, prev, formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      }
      return result;
    },
    initialActionResult,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 md:h-8" aria-label={`Edit ${category.name}`}>
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
          <DialogDescription>Change the name, description or section.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4" noValidate>
          {state.ok ? null : <FormAlert state={state} />}
          <FormField
            id={`category-${category.id}-name`}
            label="Category name"
            name="name"
            required
            maxLength={60}
            defaultValue={category.name}
            errors={state.fieldErrors?.name}
          />
          <DescriptionField
            id={`category-${category.id}-description`}
            defaultValue={category.description}
            errors={state.fieldErrors?.description}
          />
          <div className="grid gap-2">
            <Label htmlFor={`category-${category.id}-section`}>Section</Label>
            <NativeSelect
              id={`category-${category.id}-section`}
              name="sectionId"
              defaultValue={category.sectionId}
              className="h-11 md:h-9"
            >
              {sections.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
            Save category
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
