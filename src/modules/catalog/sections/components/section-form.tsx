"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialActionResult } from "@/lib/action-result";
import { createSection, updateSection } from "../actions";
import { DescriptionField } from "./description-field";

type Props =
  { mode: "create" } | { mode: "edit"; section: { id: string; name: string; description: string } };

export function SectionForm(props: Props) {
  const action =
    props.mode === "create" ? createSection : updateSection.bind(null, props.section.id);
  const [state, formAction, pending] = useActionState(action, initialActionResult);
  const idPrefix = props.mode === "create" ? "new-section" : "edit-section";
  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4" noValidate>
      <h2 className="font-semibold">
        {props.mode === "create" ? "Add a section" : "Section details"}
      </h2>
      <FormAlert state={state} />
      <FormField
        id={`${idPrefix}-name`}
        label="Section name"
        name="name"
        required
        maxLength={60}
        placeholder="e.g. Frozen Food"
        defaultValue={props.mode === "edit" ? props.section.name : undefined}
        errors={state.fieldErrors?.name}
      />
      <DescriptionField
        id={`${idPrefix}-description`}
        defaultValue={props.mode === "edit" ? props.section.description : undefined}
        errors={state.fieldErrors?.description}
        placeholder="What this section sells"
      />
      <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
        {props.mode === "create" ? "Add section" : "Save section"}
      </SubmitButton>
    </form>
  );
}
