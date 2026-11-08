import { formatMoney, formatQuantity } from "@/lib/decimal";

/** Money for display, e.g. "₦15,000.00". Decimal strings only, never JS numbers. */
export function money(value: string | null | undefined, currency: string): string {
  return value === null || value === undefined ? "—" : formatMoney(value, currency);
}

/** Quantity with unit symbol, e.g. "24 pc". */
export function qty(value: string, unitCode: string): string {
  return formatQuantity(value, unitCode);
}

/** Date and time in the business's time zone. */
export function when(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}
