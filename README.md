# RBMS — Retail Business Management System

A multi-tenant retail management web app (installable PWA) for businesses with several sections such as Groceries, Frozen Food, Beverages and Islamic Wear. Inventory is the core; sales, purchases, suppliers, customers, credit, expenses and accounting are optional modules.

**Status:** Stage 2 of 15 — project foundation. No business features yet. See [`docs/stage-reports`](docs/stage-reports).

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui · Supabase (PostgreSQL, Auth, Storage, Row-Level Security) · Vitest · self-hosted with Docker + Caddy.

## Getting started (development)

Requirements: Node.js 22+, npm, Docker Desktop (for the local database from Stage 3).

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

The app runs without a database during Stage 2. From Stage 3:

```bash
npm run db:start       # starts local Supabase in Docker; prints URL and keys
# copy "API URL", "anon key" and "service_role key" into .env.local
npm run db:reset       # re-applies migrations and seed data
npm run db:types       # regenerates src/types/database.ts
```

## Scripts

| Command                           | What it does                                                          |
| --------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                     | Development server                                                    |
| `npm run build` / `npm start`     | Production build / run it                                             |
| `npm run lint`                    | ESLint, incl. the rule that core code may not import optional modules |
| `npm run typecheck`               | TypeScript check                                                      |
| `npm test`                        | Unit tests (Vitest)                                                   |
| `npm run format` / `format:check` | Prettier                                                              |
| `npm run check`                   | Formatting + lint + type-check + tests                                |

## Project structure

```
src/
  app/                 Pages and layouts (Next.js App Router)
    (app)/             Signed-in area: shell + one folder per screen
  components/
    ui/                shadcn/ui components (generated; not hand-edited)
    layout/            App shell: sidebar, top bar, page header, placeholders
  modules/
    registry.ts        Every module: name, core/optional, dependencies, menu items
    <module>/          Module code (from Stage 5): actions, queries, components, schemas
  lib/
    supabase/          Browser, server, admin (service-role) clients and session proxy
    env.ts             Validated public settings; env.server.ts for secrets
    decimal.ts         Exact money and quantity maths
  hooks/               Shared React hooks
  types/database.ts    Generated database types (Stage 3)
  proxy.ts             Runs before each request (session refresh; route protection in Stage 4)
supabase/              Local Supabase config and migrations
deploy/                Self-hosting: Docker Compose, Caddy, server guide
docs/                  Design documents (start with docs/README.md)
```

## Security rules (summary)

- Every business's data is isolated by PostgreSQL Row-Level Security; the screens only hide things for convenience.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (`src/lib/env.server.ts`, guarded by `server-only`).
- Money and quantities never use JavaScript floating point — use `src/lib/decimal.ts`.

Full model: [`docs/14-security-model.md`](docs/14-security-model.md).

## Deployment

See [`deploy/README.md`](deploy/README.md).
