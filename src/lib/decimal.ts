import Decimal from "decimal.js";

/**
 * Exact decimal arithmetic for money and stock quantities.
 *
 * Why: ordinary JavaScript numbers are binary floating point, so
 * 0.1 + 0.2 = 0.30000000000000004 and 2.675 rounds to 2.67. Over thousands of
 * sales that drifts. The database stores numeric(18,2) money and
 * numeric(18,4) quantities; this module matches those rules in TypeScript.
 *
 * Values cross the network as strings ("12500.00"), never as JS numbers.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type DecimalValue = InstanceType<typeof D>;
export type DecimalInput = string | number | DecimalValue;

export const MONEY_DP = 2;
export const QUANTITY_DP = 4;
export const FACTOR_DP = 6;

const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

/** Parses a value into an exact decimal, rejecting NaN, Infinity and junk text. */
export function toDecimal(value: DecimalInput): DecimalValue {
  if (value instanceof D) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
    return new D(value);
  }
  const trimmed = value.trim();
  if (!NUMERIC_STRING.test(trimmed)) throw new RangeError(`Not a valid number: "${value}"`);
  return new D(trimmed);
}

/** Rounds to 2 decimal places, half-up (₦ kobo). */
export function roundMoney(value: DecimalInput): DecimalValue {
  return toDecimal(value).toDecimalPlaces(MONEY_DP);
}

/** Rounds to 4 decimal places (stock quantities). */
export function roundQuantity(value: DecimalInput): DecimalValue {
  return toDecimal(value).toDecimalPlaces(QUANTITY_DP);
}

/** Money as a fixed 2-decimal string for the database / API ("12500.00"). */
export function moneyString(value: DecimalInput): string {
  return roundMoney(value).toFixed(MONEY_DP);
}

/** Adds money amounts exactly. */
export function sumMoney(values: DecimalInput[]): DecimalValue {
  return roundMoney(values.reduce<DecimalValue>((acc, v) => acc.plus(toDecimal(v)), new D(0)));
}

/** quantity × unit price, rounded to money. */
export function lineTotal(quantity: DecimalInput, unitPrice: DecimalInput): DecimalValue {
  return roundMoney(toDecimal(quantity).times(toDecimal(unitPrice)));
}

/**
 * Converts a quantity in some unit to the product's base unit.
 * Example: 3 cartons with factor 24 (pieces per carton) → 72 pieces.
 */
export function toBaseQuantity(quantity: DecimalInput, factor: DecimalInput): DecimalValue {
  const f = toDecimal(factor);
  if (f.lte(0)) throw new RangeError("Conversion factor must be greater than zero");
  return roundQuantity(toDecimal(quantity).times(f));
}

/** Converts a base-unit quantity back to another unit. 30 pieces ÷ 24 → 1.25 cartons. */
export function fromBaseQuantity(baseQuantity: DecimalInput, factor: DecimalInput): DecimalValue {
  const f = toDecimal(factor);
  if (f.lte(0)) throw new RangeError("Conversion factor must be greater than zero");
  return roundQuantity(toDecimal(baseQuantity).dividedBy(f));
}

/** True when the quantity is a whole number (for units that don't allow decimals). */
export function isWholeQuantity(value: DecimalInput): boolean {
  return toDecimal(value).isInteger();
}

/** Formats money for display, e.g. "₦12,500.00". */
export function formatMoney(value: DecimalInput, currency = "NGN", locale = "en-NG"): string {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  // Intl accepts decimal strings exactly, avoiding a float conversion.
  return formatter.format(moneyString(value) as unknown as number);
}

/** Formats a quantity with its unit, trimming useless zeros: "1.25 ctn", "72 pc". */
export function formatQuantity(value: DecimalInput, unitSymbol?: string): string {
  const text = roundQuantity(value).toFixed();
  return unitSymbol ? `${text} ${unitSymbol}` : text;
}

export type ParsedDecimal = { ok: true; value: string } | { ok: false; error: string };

/**
 * Reads a number typed by a person: "12,500", "₦ 12 500.50", "1.25".
 * Thousands separators, spaces and currency signs are ignored. Returns the
 * exact decimal as a string (never a JS number), or a plain-language error.
 */
export function parseDecimalInput(
  text: string,
  options: { maxDecimals: number; allowZero?: boolean; max?: string; label?: string },
): ParsedDecimal {
  const label = options.label ?? "Amount";
  const cleaned = text.replace(/[\s,₦]/g, "");
  if (cleaned === "") return { ok: false, error: `Enter ${label.toLowerCase()}` };
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { ok: false, error: `${label} must be a number` };
  const value = toDecimal(cleaned);
  if (value.decimalPlaces() > options.maxDecimals) {
    return {
      ok: false,
      error:
        options.maxDecimals === 0
          ? `${label} must be a whole number`
          : `${label} can have at most ${options.maxDecimals} decimal places`,
    };
  }
  if (value.isZero() && !(options.allowZero ?? true)) {
    return { ok: false, error: `${label} must be more than zero` };
  }
  if (options.max && value.gt(toDecimal(options.max))) {
    return { ok: false, error: `${label} is too large` };
  }
  return { ok: true, value: value.toFixed() };
}
