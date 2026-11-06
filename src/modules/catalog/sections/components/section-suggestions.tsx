"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSuggestedSection } from "../actions";

/**
 * Quick-start buttons for common sections not yet created. Open while the
 * business has no sections; folded away (but still available) afterwards.
 * Suggestions are just shortcuts: nothing is created until someone clicks,
 * and every business can name its sections however it likes.
 */
const SUGGESTIONS = [
  "Groceries",
  "Frozen Food",
  "Beverages",
  "Household",
  "Islamic Wear",
  "Clothing & Accessories",
  "Electronics",
];

export function SectionSuggestions({ existing }: { existing: string[] }) {
  const [pending, start] = useTransition();
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const options = SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase()));
  if (options.length === 0) return null;
  return (
    <details
      className="group grid gap-2 self-start rounded-lg border border-dashed p-4"
      open={existing.length === 0}
    >
      <summary className="cursor-pointer text-sm font-medium">Quick start: common sections</summary>
      <p className="text-muted-foreground mt-2 text-sm">
        Added with one tap. You can rename or archive them later.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((name) => (
          <Button
            key={name}
            type="button"
            variant="outline"
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createSuggestedSection(name);
                if (r.ok) toast.success(r.message);
                else toast.error(r.message);
              })
            }
          >
            <Plus /> {name}
          </Button>
        ))}
      </div>
    </details>
  );
}
