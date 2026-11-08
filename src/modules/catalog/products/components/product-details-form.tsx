"use client";

import { useState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { updateProductDetails } from "../actions";
import type { SectionChoice } from "../queries";

export function ProductDetailsForm({
  product,
  sections,
}: {
  product: {
    id: string;
    name: string;
    brand: string;
    description: string;
    sectionId: string;
    sectionName: string;
    categoryId: string | null;
    categoryName: string | null;
    optionNames: string[];
  };
  sections: SectionChoice[];
}) {
  const [state, action, pending] = useFormAction(updateProductDetails.bind(null, product.id));
  // The current section/category stay selectable even if archived since.
  const choices = sections.some((s) => s.id === product.sectionId)
    ? sections
    : [
        { id: product.sectionId, name: `${product.sectionName} (archived)`, categories: [] },
        ...sections,
      ];
  const [sectionId, setSectionId] = useState(product.sectionId);
  const categories = [...(choices.find((s) => s.id === sectionId)?.categories ?? [])];
  if (
    sectionId === product.sectionId &&
    product.categoryId &&
    !categories.some((c) => c.id === product.categoryId)
  ) {
    categories.unshift({ id: product.categoryId, name: `${product.categoryName} (archived)` });
  }

  return (
    <form onSubmit={action} className="grid gap-4 rounded-lg border p-4" noValidate>
      <h2 className="font-semibold">Product details</h2>
      <FormAlert state={state} />
      <FormField
        id="detail-name"
        label="Product name"
        name="name"
        maxLength={120}
        defaultValue={product.name}
        errors={state.fieldErrors?.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="detail-section">Section</Label>
          <NativeSelect
            id="detail-section"
            name="sectionId"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="h-11 md:h-9"
          >
            {choices.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="detail-category">Category</Label>
          <NativeSelect
            key={sectionId}
            id="detail-category"
            name="categoryId"
            defaultValue={sectionId === product.sectionId ? (product.categoryId ?? "") : ""}
            className="h-11 md:h-9"
          >
            <NativeSelectOption value="">No category</NativeSelectOption>
            {categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <FormField
        id="detail-brand"
        label="Brand"
        name="brand"
        maxLength={60}
        defaultValue={product.brand}
        errors={state.fieldErrors?.brand}
      />
      {product.optionNames.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {product.optionNames.map((n, i) => (
            <FormField
              key={i}
              id={`detail-option-${i}`}
              label={`Option ${i + 1} name`}
              name="optionName"
              maxLength={30}
              defaultValue={n}
            />
          ))}
          <p className="text-muted-foreground text-xs sm:col-span-3">
            Options can be renamed. To use different options, create a new product.
          </p>
          {state.fieldErrors?.optionName ? (
            <p className="text-destructive text-sm sm:col-span-3" role="alert">
              {state.fieldErrors.optionName.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="detail-description">Description</Label>
        <Textarea
          id="detail-description"
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={product.description}
        />
      </div>
      <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
        Save details
      </SubmitButton>
    </form>
  );
}
