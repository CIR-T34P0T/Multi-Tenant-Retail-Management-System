import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ListFilter } from "../schemas";

/**
 * Search and status filter. A plain GET form: the filter lives in the address,
 * so it works without JavaScript and can be bookmarked or shared.
 */
export function ListFilterForm({
  filter,
  basePath,
  searchLabel,
  placeholder,
}: {
  filter: ListFilter;
  basePath: string;
  searchLabel: string;
  placeholder: string;
}) {
  const active = filter.q !== "" || filter.status !== "active";
  return (
    <form
      method="get"
      action={basePath}
      role="search"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="grid flex-1 gap-2">
        <Label htmlFor={`${basePath}-q`}>{searchLabel}</Label>
        <Input
          id={`${basePath}-q`}
          name="q"
          type="search"
          defaultValue={filter.q}
          placeholder={placeholder}
          className="h-11 md:h-9"
        />
      </div>
      <div className="grid gap-2 sm:w-40">
        <Label htmlFor={`${basePath}-status`}>Show</Label>
        <NativeSelect
          id={`${basePath}-status`}
          name="status"
          defaultValue={filter.status}
          className="h-11 md:h-9"
        >
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="archived">Archived</NativeSelectOption>
          <NativeSelectOption value="all">All</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="h-11 md:h-9">
          <Search /> Search
        </Button>
        {active ? (
          <Button asChild variant="ghost" className="h-11 md:h-9">
            <Link href={basePath}>Clear</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
