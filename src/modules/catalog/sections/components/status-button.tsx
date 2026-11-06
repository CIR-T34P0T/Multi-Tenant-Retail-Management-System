"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/**
 * Archive (with confirmation) or restore. Archiving never deletes anything.
 */
export function StatusButton({
  name,
  status,
  explanation,
  onChange,
}: {
  name: string;
  status: "active" | "archived";
  explanation: string;
  onChange: (next: "active" | "archived") => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const run = (next: "active" | "archived") =>
    start(async () => {
      const r = await onChange(next);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  if (status === "archived") {
    return (
      <Button
        variant="outline"
        className="h-11 md:h-8"
        disabled={pending}
        onClick={() => run("active")}
        aria-label={`Restore ${name}`}
      >
        <ArchiveRestore /> Restore
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="h-11 md:h-8"
          disabled={pending}
          aria-label={`Archive ${name}`}
        >
          <Archive /> Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive &quot;{name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            {explanation} Nothing is deleted, and you can restore it at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 md:h-9">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-11 md:h-9" onClick={() => run("archived")}>
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
