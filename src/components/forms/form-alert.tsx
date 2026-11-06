import { CircleCheck, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

/** Shows the overall success or error message from a Server Action. */
export function FormAlert({ state }: { state: ActionResult }) {
  if (!state.message) return null;
  return (
    <Alert variant={state.ok ? "default" : "destructive"} role={state.ok ? "status" : "alert"}>
      {state.ok ? <CircleCheck /> : <TriangleAlert />}
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
