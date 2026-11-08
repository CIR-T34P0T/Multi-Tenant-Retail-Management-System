"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";

/**
 * A small dialog that edits one value (a price, a cost, a factor…) and closes
 * itself once the server confirms the save.
 */
export function ValueDialog({
  trigger,
  triggerLabel,
  title,
  description,
  fieldName,
  fieldLabel,
  defaultValue,
  hint,
  inputMode = "decimal",
  action,
}: {
  trigger: React.ReactNode;
  triggerLabel: string;
  title: string;
  description?: string;
  fieldName: string;
  fieldLabel: string;
  defaultValue?: string;
  hint?: string;
  inputMode?: "decimal" | "numeric" | "text";
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useFormAction(action, {
    onSuccess: (result) => {
      toast.success(result.message);
      setOpen(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 md:h-8" aria-label={triggerLabel}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={formAction} className="grid gap-4" noValidate>
          {state.ok ? null : <FormAlert state={state} />}
          <FormField
            id={`${fieldName}-${triggerLabel.replace(/\W+/g, "-")}`}
            label={fieldLabel}
            name={fieldName}
            inputMode={inputMode}
            defaultValue={defaultValue}
            hint={hint}
            autoComplete="off"
            errors={state.fieldErrors?.[fieldName]}
          />
          <SubmitButton pending={pending} className="h-11 w-fit md:h-9">
            Save
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
