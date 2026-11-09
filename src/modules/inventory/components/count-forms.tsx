"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ClipboardCheck, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { formatQuantity, toDecimal } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import type { SectionChoice } from "@/modules/catalog/products/queries";
import { cancelCount, checkStockRecords, postCount, saveCountLine, startCount } from "../actions";
import type { CountLine } from "../queries";

export function StartCountForm({ sections }: { sections: SectionChoice[] }) {
  const [state, action, pending] = useFormAction(startCount);
  return (
    <form
      onSubmit={action}
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      noValidate
    >
      <div className="grid gap-2">
        <Label htmlFor="count-scope">What to count</Label>
        <NativeSelect id="count-scope" name="scope" defaultValue="" className="h-11 md:h-9">
          <NativeSelectOption value="">Everything</NativeSelectOption>
          <NativeSelectOptGroup label="One section">
            {sections.map((s) => (
              <NativeSelectOption key={s.id} value={`s:${s.id}`}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
          {sections.some((s) => s.categories.length > 0) ? (
            <NativeSelectOptGroup label="One category">
              {sections.flatMap((s) =>
                s.categories.map((c) => (
                  <NativeSelectOption key={c.id} value={`c:${c.id}`}>
                    {s.name} › {c.name}
                  </NativeSelectOption>
                )),
              )}
            </NativeSelectOptGroup>
          ) : null}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="count-note">Note (optional)</Label>
        <Input
          id="count-note"
          name="note"
          maxLength={500}
          placeholder="e.g. End of month"
          className="h-11 md:h-9"
        />
      </div>
      <SubmitButton pending={pending}>
        <ClipboardCheck /> Start count
      </SubmitButton>
      <div className="sm:col-span-3">
        <FormAlert state={state} />
      </div>
    </form>
  );
}

type Show = "all" | "todo" | "differences";

/** Difference between what was counted and what the system had at that moment. */
function difference(line: CountLine) {
  if (line.counted === null || line.systemQuantity === null) return null;
  return toDecimal(line.counted).minus(toDecimal(line.systemQuantity));
}

function CountRow({ line, open }: { line: CountLine; open: boolean }) {
  const [value, setValue] = useState(line.counted ?? "");
  const [saved, setSaved] = useState(line.counted ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const diff = difference(line);
  const inputId = `count-${line.id}`;
  const name = `${line.productName}${line.label ? ` · ${line.label}` : ""}`;

  const save = () => {
    if (value.trim() === saved.trim()) return;
    start(async () => {
      const r = await saveCountLine(line.id, value, line.allowsDecimal);
      if (r.ok) {
        setSaved(value);
        setError(null);
      } else setError(r.message ?? "Could not save");
    });
  };

  return (
    <li className="grid gap-2 p-3 sm:grid-cols-[1fr_9rem_9rem] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={inputId} className="block truncate font-medium">
          {name}
        </label>
        <p className="text-muted-foreground text-xs">
          <span className="font-mono">{line.sku}</span> · in system{" "}
          {formatQuantity(line.systemQuantity ?? line.onHand, line.unitCode)}
          {line.countedBy ? ` · counted by ${line.countedBy}` : ""}
        </p>
      </div>
      {open ? (
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Count"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              aria-invalid={error ? true : undefined}
              className="h-11 md:h-9"
            />
            <span className="text-muted-foreground w-8 text-sm">{line.unitCode}</span>
          </div>
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : pending ? (
            <p className="text-muted-foreground text-xs">Saving…</p>
          ) : null}
        </div>
      ) : (
        <p className="tabular-nums">
          {line.counted === null ? (
            <span className="text-muted-foreground">Not counted</span>
          ) : (
            formatQuantity(line.counted, line.unitCode)
          )}
        </p>
      )}
      <p
        className={cn(
          "text-sm tabular-nums sm:text-right",
          diff && !diff.isZero() && "font-medium",
        )}
      >
        {diff === null ? (
          ""
        ) : diff.isZero() ? (
          <span className="text-primary inline-flex items-center gap-1">
            <CheckCircle2 className="size-4" aria-hidden /> Matches
          </span>
        ) : (
          <span className={diff.isNegative() ? "text-destructive" : "text-primary"}>
            {diff.isNegative() ? "−" : "+"}
            {formatQuantity(diff.abs().toFixed(), line.unitCode)}{" "}
            {diff.isNegative() ? "short" : "extra"}
          </span>
        )}
      </p>
    </li>
  );
}

/** The counting sheet: one box per item, saved as you go. */
export function CountSheet({ lines, open }: { lines: CountLine[]; open: boolean }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lines.filter((l) => {
      if (needle && !`${l.productName} ${l.label} ${l.sku}`.toLowerCase().includes(needle))
        return false;
      if (show === "todo") return l.counted === null;
      if (show === "differences") {
        const d = difference(l);
        return d !== null && !d.isZero();
      }
      return true;
    });
  }, [lines, q, show]);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Find an item in this count"
            placeholder="Find an item"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 pl-9 md:h-9"
          />
        </div>
        <NativeSelect
          aria-label="Show"
          value={show}
          onChange={(e) => setShow(e.target.value as Show)}
          className="h-11 md:h-9"
        >
          <NativeSelectOption value="all">All items</NativeSelectOption>
          <NativeSelectOption value="todo">Not counted yet</NativeSelectOption>
          <NativeSelectOption value="differences">Differences</NativeSelectOption>
        </NativeSelect>
      </div>
      {visible.length > 0 ? (
        <ul className="divide-y rounded-lg border" aria-label="Items to count">
          {visible.map((l) => (
            <CountRow key={l.id} line={l} open={open} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Nothing to show.
        </p>
      )}
    </div>
  );
}

export function CountActions({
  countId,
  counted,
  total,
  differences,
}: {
  countId: string;
  counted: number;
  total: number;
  differences: number;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  return (
    <div className="flex flex-wrap gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="h-11 md:h-9" disabled={pending || counted === 0}>
            <ShieldCheck /> Post count
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post this count?</AlertDialogTitle>
            <AlertDialogDescription>
              {counted} of {total} items were counted; {differences}{" "}
              {differences === 1 ? "has a difference" : "have differences"}. Stock will be corrected
              to match what was counted. Items not counted stay as they are. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 md:h-9">Go back</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 md:h-9"
              onClick={() => run(() => postCount(countId))}
            >
              Post count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="h-11 md:h-9" disabled={pending}>
            <X /> Cancel count
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this count?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing counted so far will be applied. No stock changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 md:h-9">Keep counting</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 md:h-9"
              onClick={() => run(() => cancelCount(countId))}
            >
              Cancel count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Reconciliation on demand: every balance against its full history. */
export function CheckRecordsButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="h-11 md:h-9"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await checkStockRecords();
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      <ShieldCheck /> Check stock records
    </Button>
  );
}
