<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules (RBMS)

- Read `docs/README.md`, `docs/12-decision-log.md` and the docs for the current stage before changing code. `docs/12` overrides older docs.
- Build one stage at a time (`docs/10-mvp-scope-and-roadmap.md` §5). Do not start the next stage or another major module without the owner's approval.
- Inspect existing code before modifying it; preserve existing behaviour and re-run all tests.
- Every tenant table has `business_id`, RLS, and composite foreign keys `(business_id, id)`. Ledger tables are append-only and written only by database functions.
- Core code (`core`, `catalog`, `pricing`, `inventory`, `dashboard`, `src/lib`, `src/components`) must not import optional modules.
- Use `src/lib/decimal.ts` for money and quantities; never JS floats.
- Never report a test as passing without running it. Finish each stage with a report in `docs/stage-reports/`.
- Explain decisions in plain language; the owner is not an experienced developer.
