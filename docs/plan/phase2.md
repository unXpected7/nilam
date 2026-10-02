# Phase 2 — Nilam commerce operations and storefront completion

**Status: IN PROGRESS**  
**Updated: 2026-10-02 (Asia/Jakarta)**

## Purpose

Turn the Phase 1 catalogue foundation into a deployable, testable commerce operation. Nilam remains an original modest-fashion brand: all media, copy, products, and design assets must be original or appropriately licensed.

## Phase 1 carryover map

Every unfinished Phase 1 deliverable is owned by a Phase 2 section below. Items already delivered after the Phase 1 checklist was last updated are recorded in the current baseline rather than repeated as open work.

| Unfinished Phase 1 area | Phase 2 owner |
| --- | --- |
| Editorial modules, guided undertone/style discovery, category/video stories, curated series, data-state UI | §7 Storefront parity and content |
| Store locator and about/terms/privacy routes | Completed in Current baseline; verify publicly in §1 |
| API validation, errors, pagination, sorting, filters, customer-ready carts, and seed safety | §2 API consistency and §3 Cart and checkout readiness |
| Admin roles, auditability, validation, filtering, pagination, and protected uploads | §2, §5, and §6 |
| Product media, SEO, archival safeguards, variants, collection assignment, and inventory history | §4 Catalogue and inventory ERP, §5 Media pipeline |
| Orders, fulfilment, refunds/cancellations, customer/store/newsletter/content operations | §3 and §4 |
| Responsive review, accessibility, performance, and critical-flow testing | §8 Quality gate |

## Current baseline

- [x] React/Vite storefront, Express/Prisma API, and PostgreSQL development environment are operational.
- [x] Product list, search, detail, category browsing, seeded catalogue, and initial backend-hosted ERP are implemented.
- [x] Anonymous cookie-backed cart API and storefront cart state are implemented.
- [x] Product detail now displays stock availability and can add an available variant to the cart.
- [x] Header search, cart count/drawer, newsletter subscription, store search, and about/terms/privacy routes are wired to real routes or APIs.
- [x] ERP product create/edit payload submission is fixed.
- [x] Backend container now uses `prisma migrate deploy` rather than `prisma db push`.
- [x] Versioned backend-domain Nginx sources now proxy the ERP root to backend ports.
- [x] Frontend lint/build, backend type lint, and whitespace checks pass.

## 1. Stabilize the current release

- [ ] Commit the plan relocation and the current frontend/backend/deployment changes in coherent commits.
- [ ] Push `main` and verify the development GitHub Action succeeds.
- [ ] Deploy the corrected public Nginx configurations to the gateway, run `nginx -t`, and reload Nginx.
- [ ] Verify publicly: storefront, product API, backend health, ERP sign-in, product create/edit, cart, newsletter, and store locator.
- [x] Baseline the pre-existing development schema and apply the inventory migration; verify migration deployment succeeds against the existing development database.
- [ ] Confirm Prisma migrations apply cleanly to a fresh development database.

## 2. API consistency and catalogue browsing

- [ ] Add request validation with a shared schema layer for every public and admin write endpoint.
- [ ] Return a consistent API error shape and appropriate status codes across routes.
- [x] Add bounded pagination to public product, collection, and store endpoints, plus stable newest/oldest/name product sorting.
- [ ] Add documented filters and pagination/sorting to the remaining admin catalogue and inventory endpoints.
- [ ] Add public collection detail endpoints and make collection merchandising data-driven.
- [ ] Add safe request-rate limits for newsletter, cart, search, and admin authentication endpoints.
- [ ] Add API integration tests for validation, errors, catalogue filters, carts, newsletter, and admin protection.

## 3. Cart and checkout readiness

- [x] Persist anonymous carts with an HttpOnly session cookie.
- [x] Implement cart read, add, quantity update, and removal endpoints with available-stock checks.
- [x] Wire the storefront add-to-bag control, cart count, and cart drawer to the cart API.
- [ ] Add cart expiry/cleanup and merge anonymous carts when a customer signs in.
- [ ] Define shipping zones, delivery methods, taxes, vouchers, and checkout totals.
- [ ] Implement order creation as an inventory-safe transaction.
- [ ] Choose and integrate a payment provider; do not enable payment collection before the cancellation/refund policy is approved.

## 4. Catalogue and inventory ERP

- [x] Provide category and collection create/edit/safe-delete controls.
- [x] Provide initial product create/edit, default SKU, price, opening stock, publication status, and audit records.
- [x] Provide current stock listing and protected stock adjustment records.
- [x] Add product-to-collection assignment in the protected API and product editor.
- [x] Add multi-variant SKU, name/option, price, opening-stock, edit, and safe-deletion controls.
- [x] Add API-level SEO title/description fields and explicit archive timestamp tracking when a product is archived.
- [ ] Add ERP SEO editing, product media management, and archival safeguards for linked media/variants.
- [x] Create immutable inventory movements with adjustment reason, actor, before/after values, and per-SKU history.
- [x] Add configurable low-stock thresholds and low-stock reporting.
- [ ] Build order list/detail, payment and fulfilment state management, cancellations/refunds, and internal notes.
- [ ] Build customer, store-location, newsletter, and content-management screens.

## 5. Media pipeline

- [ ] Create restricted Nilam MinIO credentials for backend use; keep them only in the private environment file.
- [ ] Add authenticated server-side upload handling with type, size, and image-dimension validation.
- [ ] Generate collision-safe object keys and persist media records only after successful object upload.
- [ ] Add image optimization/derivatives and safe deletion rules for unreferenced media.
- [ ] Add protected media upload controls to the ERP; never expose object-storage credentials to browser JavaScript.

## 6. Authentication, roles, and auditability

- [ ] Replace the shared admin token with individual accounts, secure sessions, password reset/revocation, and login throttling.
- [ ] Implement owner, catalogue manager, inventory manager, fulfilment staff, and reporting-reader permissions.
- [ ] Record the authenticated actor in all audit records.
- [ ] Add audit-log filtering and pagination in the ERP.
- [ ] Add customer authentication only after checkout/account requirements are finalized.

## 7. Storefront parity and content

- [ ] Build reusable editorial story cards, specification blocks, product rails, colour/variant explorer, and FAQ accordion.
- [ ] Add original category discovery and curated collection-series modules.
- [ ] Build an original guided style/undertone discovery flow using Nilam product attributes.
- [ ] Replace remaining placeholder/hash actions with intentional routes or remove them.
- [ ] Add loading, empty, and error states for every data-driven storefront module.
- [ ] Add approved original/licensed product and editorial imagery; remove temporary Unsplash assets before production launch.

## 8. Quality gate

- [ ] Add browser tests for mobile navigation, search, product selection, cart flows, newsletter, store search, and ERP product/inventory flows.
- [ ] Perform visual review at 375 px, 768 px, 1024 px, and 1440 px.
- [ ] Validate semantic landmarks, labels, focus trapping, Escape handling, keyboard navigation, contrast, and reduced-motion support.
- [ ] Add responsive image sizing, below-fold lazy loading, route-level code splitting, and layout-shift protection.
- [ ] Run dependency/security review and production smoke tests before enabling checkout.

## Definition of done

Phase 2 is complete when the public development environment is verified, an authorized team member can manage products and inventory through role-scoped ERP accounts, customers can browse and maintain an anonymous cart, all routes have tested loading/error states, and production checkout is blocked until payment, fulfilment, legal, and media-security requirements are explicitly approved.
