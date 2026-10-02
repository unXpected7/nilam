# Phase 1 — Elzatta-inspired Nilam storefront

**Status: IN PROGRESS — storefront shell and database persistence source are implemented; Prisma installation/migration is awaiting package-registry access**  
**Updated: 2026-10-02**

## Goal

Transform Nilam from the current generic marketplace starter into a production-ready fashion e-commerce storefront with the same information architecture, interaction patterns, responsive behavior, and level of visual density as the current Elzatta storefront. Nilam will keep its own brand name, product data, imagery, copy, and design tokens; no Elzatta proprietary images, logo, or text will be copied.

## Reference audit

The current reference storefront contains:

- A desktop header with top-level customer groups (`Men`, `Women`, `Couple`, `Kids`, `Sarimbit`), brand mark, account/search/cart actions, and an expandable navigation menu.
- A full-width, product-first campaign hero with colour variants, price, concise benefits, primary CTA, and supporting visual cards.
- Editorial product-story modules: benefit cards, specifications, colour exploration, FAQ accordion, and a guided undertone selector.
- Merchandising modules for category/video stories and curated product-series collections.
- Utility conversion surfaces: live cart, search, account entry, newsletter signup, store locator, service/contact block, and informational footer.

## Phase 1 deliverables

### 1. Foundation and local services — in progress

- [x] React/Vite frontend and Express/TypeScript API workspace created.
- [x] Local PostgreSQL 16 Compose service defined at `localhost:5435` (host port `5432` is occupied by an existing SSH process).
- [x] Backend `DATABASE_URL` configured for local development.
- [x] Start the database and confirm it accepts connections. The initial start was correctly blocked by the occupied host port; Nilam now runs on `5435`.
- [ ] Add Prisma ORM, generate the initial migration, and run the development seed. Schema and seed source are ready; package installation is presently stalling without registry output.
- [x] Replace the temporary in-memory product endpoint with PostgreSQL query implementation (will activate after Prisma client generation).

### 2. Storefront shell

- [x] Rebuild the header for desktop and mobile: customer-group links, centred Nilam mark, menu drawer, search, account, and cart count.
- [x] Add a mega-menu with `New Arrival`, scarves/hijab, modest apparel, couple/sarimbit, kids, hajj/umrah, and collections.
- [x] Create a sliding cart drawer, search overlay, and mobile navigation with Escape and scrim close handling. Cart/search data submission follows API availability.
- [x] Implement the shared footer: contact/service area, information links, newsletter form, social links, and store-locator trigger.

### 3. Homepage parity

- [ ] Replace the current generic marketplace hero with an Elzatta-style campaign/product hero: gallery, variant swatches, price, benefits, CTA, and mobile carousel behavior.
- [ ] Build reusable editorial modules: image-and-copy story cards, product specs, colour/variant explorer, accordion FAQ, and featured product rails.
- [ ] Build guided style/undertone discovery flow that filters Nilam products without copying reference text or products.
- [ ] Add category discovery / short-form video cards and curated collection-series sections.
- [ ] Add loading, empty, and error states for every data-driven block.

### 4. Commerce and content routes

- [ ] `/collections/:handle`: filter/sortable product listing with responsive facets and pagination.
- [ ] `/products/:handle`: image gallery, variant selection, availability, description, details, related products, and add-to-cart.
- [ ] `/search`: debounced product search with query state in the URL.
- [ ] `/pages/stores`: searchable store locator backed by store data.
- [ ] `/pages/about`, `/pages/terms`, `/pages/privacy`: branded content pages.

### 5. API and data model

- [ ] Create tables/models for users, addresses, categories, collections, products, variants, product media, inventory, carts, cart items, orders, stores, and newsletter subscribers.
- [ ] Implement API routes with validation, consistent errors, pagination, sorting, and filters.
- [ ] Implement anonymous cart persistence, then authentication-ready customer ownership.
- [ ] Add an admin-safe seed process with original Nilam catalogue data.

### 6. Quality gate

- [ ] Mobile-first visual review at 375 px, 768 px, 1024 px, and 1440 px.
- [ ] Accessibility: semantic landmarks, labelled controls, focus traps for drawers, keyboard navigation, contrast, and reduced-motion support.
- [ ] Performance: responsive image sizes, lazy loading below the fold, route-level code splitting, and no layout shift in product grids.
- [ ] Test API routes, product/cart flows, and critical responsive interactions.

## Technical decisions

| Concern | Decision |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router |
| API | Express 5, TypeScript |
| Database | PostgreSQL 16 in Docker for local development |
| ORM | Prisma 6.17, schema and persistence layer implemented; client installation/migration pending registry access |
| Images | Original Nilam product/editorial assets or appropriately licensed assets only |
| Styling | Component-scoped CSS plus shared design tokens; no copied reference CSS |

## Local database

```bash
docker compose up -d postgres
docker compose ps
docker compose down
```

Connection string (already present in `backend/.env`):

```text
postgresql://nilam:nilam_local_dev@localhost:5435/nilam
```

## vm01 environments

Two isolated PostgreSQL services are provisioned and healthy on vm01; they bind only to VM loopback: development on `5436` (`nilam_dev`) and production on `5437` (`nilam_prod`). Deployment configuration lives in `deploy/vm01/`; credentials are generated and stored only in `/home/vm01/nilam/postgres/.env` on the VM. CI/CD uses two workflows: `.github/workflows/development.yml` for `main` → the GitHub `development` Environment and `.github/workflows/production.yml` for `prod` → the protected GitHub `production` Environment.

The local backend connects directly over the LAN to vm01 development at `192.168.100.35:5436`. Production PostgreSQL remains bound to VM loopback only.

## Current next action

Resolve the current intermittent npm DNS failure (`ENOTFOUND registry.npmjs.org`), then run `npm install`, `npm run db:migrate -- --name init`, and `npm run db:seed` from `backend/`. Run `npm install` from `frontend/` separately.
