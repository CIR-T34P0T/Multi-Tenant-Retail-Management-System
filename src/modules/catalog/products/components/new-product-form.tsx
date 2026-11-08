"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { createProduct } from "../actions";
import type { SectionChoice, UnitOption } from "../queries";
import {
  MAX_OPTIONS,
  MAX_VARIANTS,
  combineOptions,
  parseOptionValues,
  suggestSku,
  variantKey,
  variantLabel,
} from "../variants";

type OptionRow = { id: number; name: string; valuesText: string };
type UnitRow = { id: number; unitId: string; factor: string; price: string };
type VariantFields = {
  included: boolean;
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  minStock: string;
};
const EMPTY_VARIANT: VariantFields = {
  included: true,
  sku: "",
  barcode: "",
  price: "",
  cost: "",
  minStock: "",
};

function ErrorText({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="text-destructive text-sm" role="alert">
      {errors.join(" ")}
    </p>
  );
}

export function NewProductForm({
  sections,
  units,
  canPrice,
  canCost,
  currency,
}: {
  sections: SectionChoice[];
  units: UnitOption[];
  canPrice: boolean;
  canCost: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>({ ok: false });
  const activeUnits = units.filter((u) => u.status === "active");

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [baseUnitId, setBaseUnitId] = useState(
    activeUnits.find((u) => u.code === "pc")?.id ?? activeUnits[0]?.id ?? "",
  );
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [extraUnits, setExtraUnits] = useState<UnitRow[]>([]);
  const [variantFields, setVariantFields] = useState<Record<string, VariantFields>>({});
  const [priceForAll, setPriceForAll] = useState("");
  const [nextId, setNextId] = useState(1);

  const baseUnit = activeUnits.find((u) => u.id === baseUnitId);
  const categories = sections.find((s) => s.id === sectionId)?.categories ?? [];
  const combos = useMemo(
    () =>
      combineOptions(
        options.map((o) => ({ name: o.name, values: parseOptionValues(o.valuesText) })),
      ),
    [options],
  );
  const tooMany = combos.length > MAX_VARIANTS;
  const fieldsFor = (combo: string[]) => variantFields[variantKey(combo)] ?? EMPTY_VARIANT;
  const setVariant = (combo: string[], patch: Partial<VariantFields>) =>
    setVariantFields((prev) => ({
      ...prev,
      [variantKey(combo)]: { ...(prev[variantKey(combo)] ?? EMPTY_VARIANT), ...patch },
    }));
  const included = combos.filter((c) => fieldsFor(c).included);
  const err = (key: string) => result.fieldErrors?.[key];

  const newId = () => {
    setNextId((n) => n + 1);
    return nextId;
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const response = await createProduct({
        name,
        brand,
        description,
        sectionId,
        categoryId,
        baseUnitId,
        options: options.map((o) => ({ name: o.name, values: parseOptionValues(o.valuesText) })),
        extraUnits: extraUnits.map((u) => ({ unitId: u.unitId, factor: u.factor, price: u.price })),
        variants: included.map((combo) => {
          const f = fieldsFor(combo);
          return {
            optionValues: combo,
            sku: f.sku,
            barcode: f.barcode,
            price: f.price,
            cost: f.cost,
            minStock: f.minStock,
          };
        }),
      });
      setResult(response);
      if (response.ok && response.productId) {
        toast.success(response.message);
        router.push(`/products/${response.productId}`);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {result.ok ? null : <FormAlert state={result} />}

      {/* ------------------------------------------------------------ details */}
      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 font-semibold">Product details</legend>
        <div className="grid gap-2">
          <Label htmlFor="product-name">Product name</Label>
          <Input
            id="product-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Men's Jalab"
            className="h-11 md:h-9"
            aria-invalid={err("name") ? true : undefined}
          />
          <ErrorText errors={err("name")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="product-section">Section</Label>
            <NativeSelect
              id="product-section"
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setCategoryId("");
              }}
              className="h-11 md:h-9"
            >
              {sections.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <ErrorText errors={err("sectionId")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="product-category">
              Category <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <NativeSelect
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 md:h-9"
            >
              <NativeSelectOption value="">No category</NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="product-brand">
              Brand <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="product-brand"
              value={brand}
              maxLength={60}
              onChange={(e) => setBrand(e.target.value)}
              className="h-11 md:h-9"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="product-base-unit">Counted in (base unit)</Label>
            <NativeSelect
              id="product-base-unit"
              value={baseUnitId}
              onChange={(e) => {
                setBaseUnitId(e.target.value);
                setExtraUnits((rows) => rows.filter((r) => r.unitId !== e.target.value));
              }}
              className="h-11 md:h-9"
            >
              {activeUnits.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-muted-foreground text-xs">
              Stock is always counted in this unit. It cannot be changed later.
            </p>
            <ErrorText errors={err("baseUnitId")} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="product-description">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="product-description"
            rows={2}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </fieldset>

      {/* ------------------------------------------------------------ options */}
      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 font-semibold">Options (optional)</legend>
        <p className="text-muted-foreground text-sm">
          Add options such as Size or Colour when the product comes in versions. Each combination
          becomes a variant with its own code, stock and price.
        </p>
        {options.map((o, i) => (
          <div key={o.id} className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor={`option-${o.id}-name`}>Option {i + 1}</Label>
              <Input
                id={`option-${o.id}-name`}
                value={o.name}
                maxLength={30}
                placeholder="e.g. Size"
                onChange={(e) =>
                  setOptions((rows) =>
                    rows.map((r) => (r.id === o.id ? { ...r, name: e.target.value } : r)),
                  )
                }
                className="h-11 md:h-9"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`option-${o.id}-values`}>Values, separated by commas</Label>
              <Input
                id={`option-${o.id}-values`}
                value={o.valuesText}
                placeholder="e.g. S, M, L, XL"
                onChange={(e) =>
                  setOptions((rows) =>
                    rows.map((r) => (r.id === o.id ? { ...r, valuesText: e.target.value } : r)),
                  )
                }
                className="h-11 md:h-9"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-11 md:h-9"
              aria-label={`Remove option ${i + 1}`}
              onClick={() => setOptions((rows) => rows.filter((r) => r.id !== o.id))}
            >
              <Trash2 />
            </Button>
            <div className="sm:col-span-3">
              <ErrorText
                errors={[
                  ...(err(`options.${i}.name`) ?? []),
                  ...(err(`options.${i}.values`) ?? []),
                ]}
              />
            </div>
          </div>
        ))}
        {options.length < MAX_OPTIONS ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-fit md:h-9"
            onClick={() =>
              setOptions((rows) => [
                ...rows,
                {
                  id: newId(),
                  name: rows.length === 0 ? "Size" : rows.length === 1 ? "Colour" : "",
                  valuesText: "",
                },
              ])
            }
          >
            <Plus /> Add option
          </Button>
        ) : null}
      </fieldset>

      {/* -------------------------------------------------------- extra units */}
      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 font-semibold">Other units (optional)</legend>
        <p className="text-muted-foreground text-sm">
          Also bought or sold in packs, cartons or crates? Say how many{" "}
          {baseUnit ? `of the base unit (${baseUnit.code})` : "base units"} each one contains.
        </p>
        {extraUnits.map((u, i) => {
          const chosen = activeUnits.find((x) => x.id === u.unitId);
          return (
            <div key={u.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor={`unit-${u.id}`}>Unit</Label>
                <NativeSelect
                  id={`unit-${u.id}`}
                  value={u.unitId}
                  onChange={(e) =>
                    setExtraUnits((rows) =>
                      rows.map((r) => (r.id === u.id ? { ...r, unitId: e.target.value } : r)),
                    )
                  }
                  className="h-11 md:h-9"
                >
                  <NativeSelectOption value="">Choose…</NativeSelectOption>
                  {activeUnits
                    .filter((x) => x.id !== baseUnitId)
                    .map((x) => (
                      <NativeSelectOption key={x.id} value={x.id}>
                        {x.name} ({x.code})
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
                <ErrorText errors={err(`extraUnits.${i}.unitId`)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`unit-${u.id}-factor`}>
                  Contains ({baseUnit?.code ?? "base units"})
                </Label>
                <Input
                  id={`unit-${u.id}-factor`}
                  inputMode="decimal"
                  value={u.factor}
                  placeholder="e.g. 24"
                  onChange={(e) =>
                    setExtraUnits((rows) =>
                      rows.map((r) => (r.id === u.id ? { ...r, factor: e.target.value } : r)),
                    )
                  }
                  className="h-11 md:h-9"
                />
                <ErrorText errors={err(`extraUnits.${i}.factor`)} />
              </div>
              {canPrice ? (
                <div className="grid gap-2">
                  <Label htmlFor={`unit-${u.id}-price`}>
                    Price per {chosen?.name.toLowerCase() ?? "unit"} ({currency})
                  </Label>
                  <Input
                    id={`unit-${u.id}-price`}
                    inputMode="decimal"
                    value={u.price}
                    onChange={(e) =>
                      setExtraUnits((rows) =>
                        rows.map((r) => (r.id === u.id ? { ...r, price: e.target.value } : r)),
                      )
                    }
                    className="h-11 md:h-9"
                  />
                  <ErrorText errors={err(`extraUnits.${i}.price`)} />
                </div>
              ) : (
                <div />
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-11 md:h-9"
                aria-label={`Remove unit ${i + 1}`}
                onClick={() => setExtraUnits((rows) => rows.filter((r) => r.id !== u.id))}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-fit md:h-9"
          onClick={() =>
            setExtraUnits((rows) => [...rows, { id: newId(), unitId: "", factor: "", price: "" }])
          }
        >
          <Plus /> Add a unit
        </Button>
      </fieldset>

      {/* ----------------------------------------------------------- variants */}
      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 font-semibold">
          {combos.length === 1 && combos[0].length === 0
            ? "Code, price and stock alert"
            : `Variants (${included.length} of ${combos.length})`}
        </legend>
        {tooMany ? (
          <p className="text-destructive text-sm" role="alert">
            These options make {combos.length} variants; the limit is {MAX_VARIANTS}. Use fewer
            values.
          </p>
        ) : null}
        {canPrice && combos.length > 1 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="price-for-all">Same price for all ({currency})</Label>
              <Input
                id="price-for-all"
                inputMode="decimal"
                value={priceForAll}
                onChange={(e) => setPriceForAll(e.target.value)}
                className="h-11 sm:w-48 md:h-9"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-fit md:h-9"
              onClick={() => combos.forEach((c) => setVariant(c, { price: priceForAll }))}
            >
              Apply to all
            </Button>
          </div>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Leave the product code empty to create one automatically
          {name ? `, e.g. ${suggestSku(name, combos[0] ?? [])}` : ""}.
        </p>
        {!tooMany ? (
          <ul className="grid gap-3" aria-label="Variants to create">
            {combos.map((combo) => {
              const f = fieldsFor(combo);
              const key = variantKey(combo);
              const index = included.findIndex((c) => variantKey(c) === key);
              const e = (field: string) =>
                index >= 0 ? err(`variants.${index}.${field}`) : undefined;
              const label = variantLabel(combo);
              const slug = key.replace(/[^a-z0-9]+/gi, "-") || "standard";
              return (
                <li
                  key={key}
                  className="grid gap-3 rounded-md border p-3 data-[off=true]:opacity-60"
                  data-off={!f.included}
                >
                  <div className="flex items-center gap-2">
                    {combos.length > 1 ? (
                      <Checkbox
                        id={`variant-${slug}-include`}
                        checked={f.included}
                        onCheckedChange={(v) => setVariant(combo, { included: v === true })}
                        aria-label={`Create ${label}`}
                      />
                    ) : null}
                    <span className="font-medium">{label}</span>
                  </div>
                  <ErrorText errors={index >= 0 ? err(`variants.${index}`) : undefined} />
                  {f.included ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="grid gap-1">
                        <Label htmlFor={`variant-${slug}-sku`} className="text-xs">
                          Product code (SKU)
                        </Label>
                        <Input
                          id={`variant-${slug}-sku`}
                          value={f.sku}
                          maxLength={40}
                          onChange={(ev) => setVariant(combo, { sku: ev.target.value })}
                          className="h-11 md:h-9"
                        />
                        <ErrorText errors={e("sku")} />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor={`variant-${slug}-barcode`} className="text-xs">
                          Barcode
                        </Label>
                        <Input
                          id={`variant-${slug}-barcode`}
                          value={f.barcode}
                          maxLength={32}
                          onChange={(ev) => setVariant(combo, { barcode: ev.target.value })}
                          className="h-11 md:h-9"
                        />
                        <ErrorText errors={e("barcode")} />
                      </div>
                      {canPrice ? (
                        <div className="grid gap-1">
                          <Label htmlFor={`variant-${slug}-price`} className="text-xs">
                            Price per {baseUnit?.code ?? "unit"} ({currency})
                          </Label>
                          <Input
                            id={`variant-${slug}-price`}
                            inputMode="decimal"
                            value={f.price}
                            onChange={(ev) => setVariant(combo, { price: ev.target.value })}
                            className="h-11 md:h-9"
                          />
                          <ErrorText errors={e("price")} />
                        </div>
                      ) : null}
                      {canCost ? (
                        <div className="grid gap-1">
                          <Label htmlFor={`variant-${slug}-cost`} className="text-xs">
                            Cost per {baseUnit?.code ?? "unit"} ({currency})
                          </Label>
                          <Input
                            id={`variant-${slug}-cost`}
                            inputMode="decimal"
                            value={f.cost}
                            onChange={(ev) => setVariant(combo, { cost: ev.target.value })}
                            className="h-11 md:h-9"
                          />
                          <ErrorText errors={e("cost")} />
                        </div>
                      ) : null}
                      <div className="grid gap-1">
                        <Label htmlFor={`variant-${slug}-min`} className="text-xs">
                          Low-stock alert at ({baseUnit?.code ?? "units"})
                        </Label>
                        <Input
                          id={`variant-${slug}-min`}
                          inputMode="decimal"
                          value={f.minStock}
                          placeholder="0"
                          onChange={(ev) => setVariant(combo, { minStock: ev.target.value })}
                          className="h-11 md:h-9"
                        />
                        <ErrorText errors={e("minStock")} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <ErrorText errors={err("variants")} />
      </fieldset>

      <div className="flex gap-2">
        <Button
          type="submit"
          className="h-11 md:h-9"
          disabled={pending || tooMany || included.length === 0}
        >
          {pending ? "Creating…" : "Create product"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 md:h-9"
          onClick={() => router.push("/products")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
