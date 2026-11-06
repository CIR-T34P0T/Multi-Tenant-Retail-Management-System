import { z } from "zod";
import { SLUG_PATTERN } from "@/lib/slug";
import { emailSchema } from "../auth/schemas";
import { CURRENCY_VALUES, TIMEZONE_VALUES } from "./options";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} is too long` })
    .transform((v) => (v === "" ? null : v));

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(emailSchema.nullable());

export const businessNameSchema = z
  .string()
  .trim()
  .min(2, { error: "Enter the business name" })
  .max(120, { error: "Name is too long" });

export const createBusinessSchema = z.object({
  name: businessNameSchema,
  slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN, {
    error: "3–48 characters: lowercase letters, numbers and hyphens (not at the start or end)",
  }),
  currency: z.enum(CURRENCY_VALUES, { error: "Choose a currency" }),
  timezone: z.enum(TIMEZONE_VALUES, { error: "Choose a time zone" }),
  phone: optionalText(32, "Phone number"),
  email: optionalEmail,
  address: optionalText(500, "Address"),
});

export const businessDetailsSchema = z.object({
  name: businessNameSchema,
  legalName: optionalText(200, "Legal name"),
  timezone: z.enum(TIMEZONE_VALUES, { error: "Choose a time zone" }),
  phone: optionalText(32, "Phone number"),
  email: optionalEmail,
  address: optionalText(500, "Address"),
});

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on");

const money = (label: string, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, { error: `${label}: enter a number with up to 2 decimals` })
    .refine((v) => Number(v) <= max, { error: `${label}: must be at most ${max}` });

export const preferencesSchema = z.object({
  allowNegativeStock: checkbox,
  lowStockAlertsEnabled: checkbox,
  requireCustomerOnSale: checkbox,
  returnsEnabled: checkbox,
  maxDiscountPercent: money("Maximum discount", 100),
  cashRoundingIncrement: money("Cash rounding", 1_000_000),
  receiptHeader: z.string().max(500, { error: "Receipt header is too long" }),
  receiptFooter: z.string().max(500, { error: "Receipt footer is too long" }),
});
