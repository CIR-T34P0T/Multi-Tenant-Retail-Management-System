/**
 * PostgreSQL `numeric` values must never pass through JavaScript numbers
 * (floating point loses precision on money). Rules for this project:
 *
 *  - READ numeric columns as text: `.select("price::text")`.
 *  - WRITE them as decimal strings via `asNumericInput("1250.50")`; the data API
 *    passes the string to PostgreSQL unchanged, so no rounding happens.
 *
 * The generated types say `number` for numeric columns; this helper documents
 * and contains the one place where we deliberately send a string instead.
 */
export function asNumericInput(decimal: string): number {
  if (!/^-?\d+(\.\d+)?$/.test(decimal)) throw new RangeError(`Not a decimal: ${decimal}`);
  return decimal as unknown as number;
}
