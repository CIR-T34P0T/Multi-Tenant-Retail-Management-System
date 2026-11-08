"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import { initialActionResult, type ActionResult } from "@/lib/action-result";

/**
 * Like `useActionState`, but the form keeps what the person typed when the
 * server says no (React clears forms after every `<form action>` submission,
 * which loses everything on a simple mistake). Use with `onSubmit`:
 *
 *   const [state, onSubmit, pending] = useFormAction(save, { resetOnSuccess: true });
 *   <form onSubmit={onSubmit}>…</form>
 */
export function useFormAction(
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>,
  options: { resetOnSuccess?: boolean; onSuccess?: (result: ActionResult) => void } = {},
) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, dispatch, pending] = useActionState(async (prev: ActionResult, form: FormData) => {
    const result = await action(prev, form);
    if (result.ok) {
      if (options.resetOnSuccess) formRef.current?.reset();
      options.onSuccess?.(result);
    }
    return result;
  }, initialActionResult);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    formRef.current = event.currentTarget;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }
  return [state, onSubmit, pending] as const;
}
