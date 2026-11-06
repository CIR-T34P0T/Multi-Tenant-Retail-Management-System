# 05 — Entity Relationship Diagram

Status: Draft v0.1 · 6 November 2026

The model is split into six diagrams for readability. Full column definitions are in `06-database-schema.md`. Diagrams use Mermaid (`erDiagram`) and render on GitHub and most Markdown viewers.

**Not drawn, but true for every tenant table:** a `business_id` column referencing `businesses`, and composite foreign keys `(business_id, parent_id)` so rows can only reference rows in the same business.

Notation: `||--o{` one-to-many (optional many) · `||--|{` one-to-many (at least one) · `|o--o{` optional parent.

---

## 1. Tenancy, identity & configuration

```mermaid
erDiagram
    businesses ||--|{ locations : has
    businesses ||--o{ business_members : has
    businesses ||--|{ roles : defines
    businesses ||--o{ business_modules : configures
    modules ||--o{ business_modules : "enabled per business"
    modules ||--o{ permissions : owns
    roles ||--o{ role_permissions : grants
    permissions ||--o{ role_permissions : "granted via"
    role_templates |o--o{ roles : "seeds"
    AUTH_USERS ||--o| profiles : "has"
    AUTH_USERS ||--o{ business_members : "member of"
    roles ||--o{ business_members : "assigned to"
    business_members ||--o{ member_locations : "restricted to"
    locations ||--o{ member_locations : ""
    business_members ||--o{ member_invitations : ""
    businesses ||--o{ document_sequences : numbers
    locations |o--o{ document_sequences : ""
    locations ||--o{ pos_devices : hosts
    businesses ||--o{ payment_methods : configures
    businesses ||--o{ reason_codes : configures
    businesses ||--o{ tax_rates : configures
    AUTH_USERS ||--o| platform_staff : "may be"
    platform_staff ||--o{ support_sessions : opens
    businesses ||--o{ support_sessions : "accessed in"

    businesses {
      uuid id PK
      citext slug UK
      char currency_code
      text timezone
      jsonb settings
    }
    locations {
      uuid id PK
      uuid business_id FK
      citext code
      location_type type
    }
    business_members {
      uuid id PK
      uuid business_id FK
      uuid user_id FK
      uuid role_id FK
      member_status status
      bool all_locations
    }
    roles {
      uuid id PK
      uuid business_id FK
      citext key
      bool is_owner
    }
    permissions {
      text code PK
      text module_code FK
      bool is_sensitive
    }
    pos_devices {
      uuid id PK
      uuid location_id FK
      text receipt_prefix
    }
```

## 2. Catalogue & pricing

```mermaid
erDiagram
    sections ||--o{ categories : groups
    sections ||--o{ products : contains
    categories |o--o{ categories : "parent of"
    categories ||--o{ category_attributes : declares
    attribute_definitions ||--o{ category_attributes : "used by"
    units |o--o{ attribute_definitions : "measured in"
    categories |o--o{ products : classifies
    brands |o--o{ products : brands
    units ||--o{ products : "base unit of"
    tax_rates |o--o{ products : "default tax"
    products ||--|{ product_variants : "has (≥1)"
    products ||--|{ product_units : "sold/bought in"
    units ||--o{ product_units : ""
    products ||--o{ product_images : ""
    product_variants ||--o{ variant_barcodes : identified_by
    units ||--o{ variant_barcodes : "barcode unit"
    price_lists ||--o{ variant_prices : contains
    product_variants ||--o{ variant_prices : "priced in"
    units ||--o{ variant_prices : "per unit"
    locations |o--o{ variant_prices : "location-specific"

    products {
      uuid id PK
      uuid category_id FK
      uuid base_unit_id FK
      product_type product_type
      bool track_batches
      bool track_expiry
      jsonb attributes
    }
    product_variants {
      uuid id PK
      uuid product_id FK
      citext sku UK
      jsonb variant_attributes
      bool is_default
      numeric reorder_level
    }
    product_units {
      uuid product_id FK
      uuid unit_id FK
      numeric factor
      bool is_base
    }
    attribute_definitions {
      uuid id PK
      citext code
      attribute_data_type data_type
      jsonb options
      bool is_variant_axis
    }
    variant_prices {
      uuid id PK
      uuid price_list_id FK
      uuid variant_id FK
      uuid unit_id FK
      numeric min_quantity
      numeric price
      timestamptz effective_from
      timestamptz effective_to
    }
```

## 3. Inventory

```mermaid
erDiagram
    product_variants ||--o{ inventory_batches : "batches of"
    product_variants ||--o{ stock_movements : moves
    locations ||--o{ stock_movements : at
    inventory_batches |o--o{ stock_movements : "batch"
    reason_codes |o--o{ stock_movements : explains
    stock_movements |o--o| stock_movements : reverses
    product_variants ||--o{ stock_levels : "balance of"
    locations ||--o{ stock_levels : ""
    inventory_batches ||--o{ batch_stock_levels : ""
    locations ||--o{ stock_adjustments : ""
    stock_adjustments ||--|{ stock_adjustment_lines : ""
    stock_transfers ||--|{ stock_transfer_lines : ""
    locations ||--o{ stock_transfers : "from / to"
    locations ||--o{ stock_counts : ""
    stock_counts ||--|{ stock_count_lines : ""

    stock_movements {
      uuid id PK
      uuid location_id FK
      uuid variant_id FK
      uuid batch_id FK
      movement_type movement_type
      numeric quantity "signed, base units"
      numeric unit_cost
      text source_type
      uuid source_id
      uuid source_line_id
      timestamptz occurred_at
      uuid created_by
    }
    stock_levels {
      uuid location_id PK
      uuid variant_id PK
      numeric on_hand
      numeric avg_cost
    }
    inventory_batches {
      uuid id PK
      uuid variant_id FK
      text batch_no
      date expiry_date
    }
```

`stock_movements.source_type/source_id` is a polymorphic reference to the originating document (sale, return, goods receipt, transfer, adjustment, count). It is not a database FK by design, because the ledger must accept movements from documents in any module.

## 4. Purchasing & suppliers

```mermaid
erDiagram
    suppliers ||--o{ purchase_orders : receives
    locations ||--o{ purchase_orders : "deliver to"
    purchase_orders ||--|{ purchase_order_lines : ""
    suppliers |o--o{ goods_receipts : "supplied"
    locations ||--o{ goods_receipts : "received at"
    purchase_orders |o--o{ goods_receipts : fulfils
    goods_receipts ||--|{ goods_receipt_lines : ""
    purchase_order_lines |o--o{ goods_receipt_lines : "received against"
    product_variants ||--o{ goods_receipt_lines : ""
    goods_receipt_lines |o--o| inventory_batches : creates
    suppliers |o--o{ purchase_returns : ""
    goods_receipts |o--o{ purchase_returns : "returned from"
    purchase_returns ||--|{ purchase_return_lines : ""
    suppliers ||--o{ supplier_account_entries : "TBC"
    suppliers ||--o{ supplier_payments : "TBC"

    goods_receipts {
      uuid id PK
      text number UK
      uuid supplier_id FK
      uuid location_id FK
      doc_status status
      numeric total
    }
    goods_receipt_lines {
      uuid id PK
      uuid variant_id FK
      uuid unit_id FK
      numeric quantity
      numeric factor
      numeric base_quantity
      numeric unit_cost
      text batch_no
      date expiry_date
    }
```

## 5. Sales, cash, customers & returns

```mermaid
erDiagram
    locations ||--o{ cash_sessions : ""
    pos_devices |o--o{ cash_sessions : "opened on"
    cash_sessions ||--o{ cash_movements : "pay-in/out"
    cash_sessions |o--o{ sales : "rings up"
    locations ||--o{ sales : ""
    customers |o--o{ sales : buys
    price_lists |o--o{ sales : "priced from"
    sales ||--|{ sale_lines : ""
    product_variants ||--o{ sale_lines : ""
    units ||--o{ sale_lines : "sold in"
    sale_lines ||--o{ sale_line_batches : "TBC"
    sales ||--o{ sale_payments : "paid by"
    payment_methods ||--o{ sale_payments : ""
    sales |o--o{ sale_returns : "returned from"
    sale_returns ||--|{ sale_return_lines : ""
    sale_lines |o--o{ sale_return_lines : ""
    sale_returns ||--o{ sale_return_refunds : ""
    customers ||--o{ customer_account_entries : "TBC"
    customers ||--o{ customer_payments : "TBC"
    customer_payments ||--o{ customer_payment_allocations : ""
    sales ||--o{ customer_payment_allocations : ""
    price_lists |o--o{ customers : "default list"

    sales {
      uuid id PK
      text number UK
      uuid client_ref UK "idempotency"
      sale_status status
      numeric total
      numeric balance_due
      bool is_offline
      bool needs_review
      timestamptz occurred_at
    }
    sale_lines {
      uuid id PK
      uuid variant_id FK
      uuid unit_id FK
      numeric quantity
      numeric factor
      numeric base_quantity
      numeric list_price
      numeric unit_price
      numeric tax_rate
      numeric unit_cost_snapshot
    }
    cash_sessions {
      uuid id PK
      uuid device_id FK
      numeric opening_float
      numeric expected_cash
      numeric counted_cash
      session_status status
    }
```

## 6. Optional modules, events & audit

```mermaid
erDiagram
    businesses ||--o{ business_events : emits
    business_events ||--o{ event_consumptions : "consumed by"
    expense_categories |o--o{ expense_categories : "parent of"
    expense_categories ||--o{ expenses : ""
    payment_methods |o--o{ expenses : "paid by"
    accounts |o--o{ accounts : "parent of"
    accounts ||--o{ account_mappings : "mapped as"
    fiscal_periods ||--o{ journal_entries : "in"
    business_events |o--o| journal_entries : "posted as"
    journal_entries ||--|{ journal_lines : ""
    accounts ||--o{ journal_lines : ""
    journal_entries |o--o| journal_entries : reverses
    businesses ||--o{ audit_logs : ""
    businesses ||--o{ attachments : ""

    business_events {
      uuid id PK
      bigint seq UK
      text event_type
      uuid aggregate_id
      jsonb payload
    }
    event_consumptions {
      uuid event_id PK
      text consumer PK
      consumption_status status
      int attempts
    }
    journal_entries {
      uuid id PK
      date entry_date
      uuid source_event_id UK
      journal_status status
    }
    journal_lines {
      bigint id PK
      uuid account_id FK
      numeric debit
      numeric credit
    }
```

**Dependency direction:** accounting and expenses tables reference core tables (e.g. `payment_methods`, `business_events`); **no core table references an accounting or expenses table** (the only link, `cash_movements.expense_id`, is deliberately a plain column without FK). This keeps the optional modules removable.
