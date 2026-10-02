# Phase 1 — Elzatta-inspired Nilam storefront

**Status: IN PROGRESS — data layer, storefront shell, commerce routes, container deployment, public routing, TLS, and the initial backend-hosted ERP UI are implemented; deployed-app verification remains**
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
- [x] Local PostgreSQL 16 Compose service defined; the active backend configuration uses the vm01 development database directly over LAN.
- [x] Backend `DATABASE_URL` configured for local development against `192.168.100.35:5436`.
- [x] Start the local and vm01 development databases and confirm PostgreSQL accepts connections.
- [x] Generate the Prisma client and run the development seed from the Mac against vm01 development PostgreSQL.
- [x] Replace the temporary in-memory product endpoint with PostgreSQL query implementation.

### 2. Storefront shell

- [x] Rebuild the header for desktop and mobile: customer-group links, centred Nilam mark, menu drawer, search, account, and cart count.
- [x] Add a mega-menu with `New Arrival`, scarves/hijab, modest apparel, couple/sarimbit, kids, hajj/umrah, and collections.
- [x] Create a sliding cart drawer, search overlay, and mobile navigation with Escape and scrim close handling. Cart/search data submission follows API availability.
- [x] Implement the shared footer: contact/service area, information links, newsletter form, social links, and store-locator trigger.

### 3. Homepage parity

- [x] Replace the generic marketplace hero with a modest-fashion campaign hero, product CTA, editorial copy, and mobile layout.
- [ ] Build reusable editorial modules: image-and-copy story cards, product specs, colour/variant explorer, accordion FAQ, and featured product rails.
- [ ] Build guided style/undertone discovery flow that filters Nilam products without copying reference text or products.
- [ ] Add category discovery / short-form video cards and curated collection-series sections.
- [ ] Add loading, empty, and error states for every data-driven block.

### 4. Commerce and content routes

- [x] `/collections/:handle`: responsive category collection browsing with API-backed/fallback catalogue state.
- [x] `/products/:handle`: product gallery, variant selection, availability messaging, product details, and add-to-bag UI scaffold.
- [x] `/search`: URL-query search route with API-backed/fallback results.
- [ ] `/pages/stores`: searchable store locator backed by store data.
- [ ] `/pages/about`, `/pages/terms`, `/pages/privacy`: branded content pages.

### 5. API and data model

- [ ] Create tables/models for users, addresses, categories, collections, products, variants, product media, inventory, carts, cart items, orders, stores, and newsletter subscribers.
- [ ] Implement API routes with validation, consistent errors, pagination, sorting, and filters.
- [ ] Implement anonymous cart persistence, then authentication-ready customer ownership.
- [ ] Add an admin-safe seed process with original Nilam catalogue data.

### 5a. Admin / ERP control centre

- [ ] Add stronger role-based authentication. The plain HTML/CSS/JavaScript admin client is served directly from the backend base URLs (`dev-api-topan.fluxorastudio.id/` and `api-topan.fluxorastudio.id/`), with protected management APIs under `/api/admin`; there is no `/admin` path.
- [x] Add token-protected admin API routes for dashboard metrics, catalogue listing, inventory listing, and audited stock adjustments. Separate development/production tokens are stored only in vm01's private environment file.
- [ ] Implement role-based access for owner, catalogue manager, inventory manager, fulfilment staff, and read-only reporting users.
- [x] Build an initial backend-hosted admin dashboard with token sign-in, summary metrics, product search, inventory listing, and audited stock adjustments.
- [x] Build the initial product-management workflow: protected product create/edit APIs, category selection, handles, descriptions, publication status, default SKU, price, opening stock, optional image, and audit records.
- [x] Add category create/edit controls and safe deletion that prevents removal while products still belong to the category.
- [ ] Extend product management with collection CRUD, multi-variant SKU/pricing controls, media upload, SEO metadata, and archival safeguards.
- [ ] Build inventory management: on-hand stock, stock adjustments with an audit trail, low-stock thresholds, and inventory movement history per SKU.
- [ ] Build order operations: order list/detail, payment status, fulfilment status, refunds/cancellations, and customer/order notes.
- [ ] Build customer, store-location, newsletter, and content-management screens.
- [ ] Add admin API validation, audit logging for write actions, pagination/filtering, and protected file-upload handling.

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
| Database | PostgreSQL 16; local backend connects to the vm01 development instance over LAN |
| ORM | Prisma 6.17; schema, seed source, API persistence layer, and container bootstrap are implemented |
| Images | Original Nilam product/editorial assets or appropriately licensed assets only |
| Styling | Component-scoped CSS plus shared design tokens; no copied reference CSS |
| Admin | Plain HTML/CSS/JavaScript ERP control centre in `backend/admin-ui`, served by Express at the backend base URL and backed by protected `/api/admin` endpoints |

## Local database

```bash
docker compose up -d postgres
docker compose ps
docker compose down
```

The active development connection string is present in `backend/.env` and targets vm01 development PostgreSQL at `192.168.100.35:5436`.

```text
postgresql://nilam_dev:***@192.168.100.35:5436/nilam_dev
```

## vm01 environments

Two isolated PostgreSQL services are provisioned and healthy on vm01; they bind only to VM loopback: development on `5436` (`nilam_dev`) and production on `5437` (`nilam_prod`). Deployment configuration lives in `deploy/vm01/`; credentials are generated and stored only in `/home/vm01/nilam/postgres/.env` on the VM. CI/CD uses two workflows: `.github/workflows/development.yml` for `main` → the GitHub `development` Environment and `.github/workflows/production.yml` for `prod` → the protected GitHub `production` Environment.

The local backend connects directly over the LAN to vm01 development at `192.168.100.35:5436`. Production PostgreSQL remains bound to VM loopback only.

GitHub Actions runs on the self-hosted vm01 runner `nilam-vm01` (labels: `self-hosted`, `linux`, `x64`, `nilam`). It is running as the vm01 user; a one-time sudo service installation is required for automatic startup after VM reboot.

Public routing uses WireGuard `10.10.0.1` (Nginx) → `10.10.0.2` (vm01). Development deploys frontend/API to `8091`/`5100`; production deploys to `8092`/`5101`. The four Cloudflare hostnames have valid Let’s Encrypt certificates. Application deployment is defined in `deploy/vm01/app/docker-compose.yml`; the workflow must be run from a repository commit that includes the new Docker and deployment files.

## Current next action

Restart the local backend and verify the backend UI at `http://localhost:4000/`, then commit all container, workflow, backend UI, and route changes to GitHub. Verify the `main` deployment brings up `nilam-dev-frontend` and `nilam-dev-backend` on vm01, and update the public Nginx backend base locations to target the backend UI when deploying the direct admin domain.
