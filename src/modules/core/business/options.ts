/** Choices offered when creating a business. Stored values are validated by the database too. */
export const TIMEZONES = [
  { value: "Africa/Lagos", label: "Nigeria (Lagos)" },
  { value: "Africa/Accra", label: "Ghana (Accra)" },
  { value: "Africa/Nairobi", label: "Kenya (Nairobi)" },
  { value: "Africa/Johannesburg", label: "South Africa (Johannesburg)" },
  { value: "Europe/London", label: "United Kingdom (London)" },
  { value: "Europe/Rome", label: "Italy (Rome)" },
  { value: "America/New_York", label: "USA Eastern (New York)" },
  { value: "UTC", label: "UTC" },
] as const;

export const CURRENCIES = [
  { value: "NGN", label: "Nigerian naira (₦)", country: "NG" },
  { value: "GHS", label: "Ghanaian cedi (GH₵)", country: "GH" },
  { value: "KES", label: "Kenyan shilling (KSh)", country: "KE" },
  { value: "ZAR", label: "South African rand (R)", country: "ZA" },
  { value: "GBP", label: "British pound (£)", country: "GB" },
  { value: "EUR", label: "Euro (€)", country: "IT" },
  { value: "USD", label: "US dollar ($)", country: "US" },
] as const;

export const TIMEZONE_VALUES = TIMEZONES.map((t) => t.value) as [string, ...string[]];
export const CURRENCY_VALUES = CURRENCIES.map((c) => c.value) as [string, ...string[]];

export function countryForCurrency(currency: string): string {
  return CURRENCIES.find((c) => c.value === currency)?.country ?? "NG";
}
