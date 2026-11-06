# Stage 5 — Sections and categories: completion report

Date: 6 November 2026 · Status: **complete, awaiting owner approval**

## Objective

Let each business define its own departments (sections) and the product groupings inside them (categories), with create, view, edit, search, archive and restore, while keeping every business's structure isolated from every other.

## What was built

| Area | Where |
|---|---|
| Database | Migration `20261106140000_sections_and_categories.sql`: `sections`, `categories`, rules, audit, Row-Level Security |
| Sections list | `/sections`: add a section, quick-start suggestions, search (name or description), filter Active / Archived / All, category counts |
| Section page | `/sections/<id>`: edit name and description, archive/restore (with confirmation), add categories, search and filter categories |
| Categories | Add; edit name, description and **move to another section**; archive/restore |
| Code | `src/modules/catalog/sections/` (input rules, search, data loading, actions, screen components) |
| Database types | `src/types/database.ts` updated for the two new tables |

### Rules (enforced by the database, not just the screens)

- Every section belongs to one business; every category to one business **and** one section of that same business (composite key).
- Names are unique ignoring capitals and extra spaces: sections within a business, categories within a section. `"  Frozen   Food "` is saved as `"Frozen Food"`.
- **Nothing is ever deleted.** Sections and categories are archived and restored; the database refuses deletion.
- No new categories in, and no moving categories into, an archived section.
- Archiving a section leaves each category's own status untouched, so restoring the section brings everything back exactly as it was.
- Who created and who archived each record, and when, is recorded automatically; every change is in the audit log.
- Seeing sections needs `catalog.product.view` (Owner, Manager, Attendant by default). Changing them needs `catalog.section.manage` (Owner, Manager).
- Section names are **not hard-coded**. The quick-start buttons (Groceries, Frozen Food, Beverages, Household, Islamic Wear, Clothing & Accessories, Electronics) are only shortcuts; nothing is created until someone taps one.

## Tests and results (all actually run)

| Check | Where | Result |
|---|---|---|
| Database tests (pgTAP) | My workspace (PostgreSQL 16) | **168 / 168 passed** (135 existing + 33 new) |
| Browser tests (Playwright) | My workspace: local Supabase stack (Auth, API, PostgreSQL) + production build | **22 / 22 passed** (16 existing + 6 new); 0 errors in the server log |
| Unit tests (Vitest) | My workspace | **78 / 78 passed** (70 existing + 8 new) |
| Formatting, lint, type-check, build | My workspace | Pass |
| GitHub checks (incl. real Supabase PostgreSQL 17 and the database-types comparison) | GitHub | Recorded below after the push |

New database tests (`08_sections_and_categories`, 33): creation; tidy names; unique names ignoring capitals (and same category name allowed in different sections); creator recorded; archive records who and when; no categories into archived sections; restore keeps each category's status; moving categories (and refusing a move that would duplicate a name); no deletion; audit entries; **Business A cannot see, change, create in, or link to Business B's sections and categories**; a section cannot be moved to another business; attendant can view but not create, rename or archive; manager can create; a member without catalogue permission sees nothing.

New browser tests (6 runs; 2 journeys also on a phone-sized screen):

| Journey | Proves |
|---|---|
| Owner builds sections and categories (desktop **and phone**) | Quick-start buttons (two used, the rest stay available), custom section with messy spacing tidied, duplicate refused, search by description, categories added, duplicate refused, rename + move to another section, category search |
| Archive and restore | Category archive with confirmation, archived filter, restore; section archive blocks adding categories; archived section found via filter and restored with all categories intact |
| Attendant (desktop **and phone**) | Sees sections and categories; no add, edit or archive controls |
| Another business | Owner B opening Owner A's section address sees "Page not found" and none of A's data; malformed addresses get the same answer |

### Proving the tests can fail

I broke the new rules on purpose and re-ran the database tests:

| Deliberate break | Result |
|---|---|
| Sections readable by every signed-in user | Caught (4 failing tests) |
| Category may point at another business's section | Caught (2) |
| Archived sections accept new categories | Caught (3) |
| Attendants allowed to edit sections | **Not caught at first.** The other half of the rule still blocked the edit, so data stayed safe, but no test tried an attendant renaming a section. Added that test; the break is now caught (1). |

The migration was restored exactly afterwards (verified by file comparison).

### Problems found and fixed

1. **Quick-start buttons disappeared after the first tap** (found while taking screenshots, not by the tests). Tapping "Groceries" hid "Frozen Food" and the others. The remaining suggestions now stay available in a folded "Quick start" panel; the browser test now taps two.
2. Test-script fixes (not app defects): the tests typed the next name while the previous save was finishing (the form clears itself after saving); they now wait for each save. Next.js keeps the previous page hidden in the background, so test look-ups now use visible elements only.

## Known limitations

- **"Not found" pages return HTTP status 200, not 404**, because pages load in stages (the loading screen is sent first). Visitors still see "Page not found" and receive no data; this only matters to search engines, and the app is private.
- **One level only**: Section → Category, with no sub-categories. Your spec doesn't ask for them; the design allows adding them later.
- **No manual ordering**: sections and categories are sorted alphabetically. A `sort_order` column is ready if you want drag-to-reorder later.
- **On phones, the "Add a section" form sits above the list**, so owners scroll past it to reach their sections. Easy to fold away later if you find it annoying.
- **Search runs on the server over the business's sections**, which is fine for hundreds. If a business ever had thousands, it would move into the database query.
- Real phones not tested yet (Stage 14).

## Decisions taken in this stage (please confirm)

| Decision | Plain-language reason |
|---|---|
| Two levels, Section → Category | Matches your spec; simpler screens. Sub-categories can be added without breaking anything. |
| Archive instead of delete, everywhere | Products (Stage 6) and history will point at these records; deleting would break that history. |
| Archiving a section doesn't change its categories' own status | Restoring a section brings back exactly what was there. |
| Categories can move between sections | Fixes setup mistakes. When products exist (Stage 6), they will move with their category automatically. |
| Quick-start suggestions, never automatic | Faster setup without hard-coding any business's structure. |
| Search and filter kept in the web address (`?q=rice&status=all`) | Works without JavaScript; filtered views can be bookmarked or shared. |

## Acceptance status

| Stage 5 requirement | Status |
|---|---|
| Sections: create, view, edit, search, archive, restore | Done, browser-tested |
| Categories: create, view, edit, search, archive (and restore) | Done, browser-tested |
| Every section in one business; every category in one business and one section | Enforced by composite keys; tested |
| Prevent cross-business relationships | Database-tested (create, link, move) and browser-tested (address) |
| No hard-coded section names or business types | Done; suggestions are optional shortcuts |
| Each business defines its own structure | Done |
| No permanent deletion of records that products will reference | Deletion refused by the database; tested |
| Responsive interfaces | Desktop and phone-size browser tests; screenshots checked |
| Tests: create, edit, archive, restore, filtering, authorization | All present and passing |

**Recommendation:** accept Stage 5. Next is **Stage 6 — Products, variants, units and prices** (e.g. Men's Jalab in White/Black × S/M/L; a carton of 12 bottles; owner-set prices with history).
