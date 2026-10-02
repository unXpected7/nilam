# Phase 3 — Nilam purchase journey and customer accounts

**Status: PLANNED**  
**Updated: 2026-10-02 (Asia/Jakarta)**

## Goal

Complete Nilam's customer purchase journey from product discovery through a secure order confirmation, while adding customer account access. The experience should match the reference storefront's information architecture, interaction quality, responsive density, and Indonesian-commerce expectations—but remain distinctly Nilam. Do not copy Elzatta branding, product data, imagery, copy, or source code.

## Scope and reference audit

Phase 3 covers five public surfaces:

| Nilam route | Reference observed | Nilam outcome |
| --- | --- | --- |
| `/collections/all` and `/collections/:handle` | Product count, sort control, filter panel/drawer, price, colour, category facets, product grid, quick purchase where a single variant is available | URL-driven catalogue browsing with accessible desktop and mobile filtering, sorting, pagination/infinite loading, and truthful product-card merchandising |
| `/products/:handle` | Large multi-image gallery, SKU, sale/regular price, availability, variant choice, material/size description, related-product rail | Fully selectable, inventory-aware PDP with gallery controls, details/fit/care content, wishlist-ready affordances, and recommendations |
| `/cart` | Dedicated cart route plus the existing cart drawer; empty state directs shoppers back to browsing | Editable cart with stock-aware quantities, totals, promo entry, shipping estimate, clear checkout handoff, and an intentional empty state |
| `/checkout` | Checkout is a protected transaction surface and cannot be meaningfully audited from an empty cart | Original, responsive, guest-first checkout for identity, delivery, payment, review, and confirmation; no payment is enabled before provider and policy approval |
| `/account/login` | Email/password login, password recovery, and sign-up path | Secure customer authentication, recovery, registration, account profile/addresses/orders, and anonymous-cart merge |

The reference's collection uses a high-density catalogue with price, colour, and category facets. Its PDP demonstrates a gallery-led layout, SKU, pricing/promotion status, product facts, availability, options, and related products. Its empty cart and login screens are intentionally simple. Phase 3 should preserve those useful patterns, not reproduce their content.

## Current baseline

- [x] React/Vite storefront, Express/Prisma API, PostgreSQL, public catalogue/search/detail routes, and cookie-backed anonymous carts exist.
- [x] Cart API supports read, add, quantity update, removal, stock checks, and server-derived subtotal; the header cart drawer is wired to it.
- [x] Product detail has product media, variants, availability messaging, and add-to-bag behaviour.
- [x] Prisma already models users, addresses, carts, orders, order items, inventory, and order/payment statuses.
- [x] A dedicated `/cart` route is synchronized with the header cart drawer. It exposes editable line items, stock-capped quantity controls, subtotal, delivery/tax guidance, empty/loading states, and an intentionally disabled checkout control until checkout is implemented.
- [x] Cart page mutations expose in-progress and recoverable error states, while the shared cart revalidates against the API when the shopper returns to the active browser tab.
- [x] Public catalogue browsing supports URL-backed newest/oldest/name sorting plus category, colour family, price range, and in-stock filtering on the all-products/search flow.
- [x] The catalogue consumes existing page metadata, reports total matching pieces, and supports an in-progress-safe “load more” path without resetting active filters.
- [x] Public filter options now come from a published-product facets endpoint, including category and colour-family counts.
- [ ] There is no checkout UI/API, customer authentication, order creation transaction, customer account UI, or payment/shipping configuration.
- [ ] Catalogue filtering is not implemented in the public UI; current collection/search responses and UI are only the initial browse experience.

## 1. Shared purchase-flow foundation

- [ ] Confirm the source of truth and calculation rules for IDR prices, sale prices, subtotal, shipping, discounts, tax (if applicable), grand total, and rounding. Prices shown in the browser must always originate from the API's current calculation.
- [ ] Define and migrate explicit domain models for shipping zones/rates, delivery methods, voucher/redemption rules, checkout/order addresses, order number, payment attempts, and order timeline/events. Snapshot product name, SKU, unit price, selected options, fulfilment address, and shipping method on each order.
- [ ] Add shared request validation and a consistent public error contract for every cart, checkout, account, and order write endpoint.
- [ ] Establish an order state machine separating order, payment, and fulfilment states; document allowed transitions, cancellation window, refund rules, and idempotency behaviour.
- [ ] Add customer-safe rate limits, CSRF protection appropriate to cookie sessions, security headers, structured logging with secret/PII redaction, and correlation IDs for all transactional requests.
- [ ] Publish approved Nilam terms, privacy, delivery, exchange/return, and payment-policy copy before checkout can accept an order.

## 2. Collections and product discovery

### API and data

- [x] Add a public facets endpoint that returns category and colour-family filter values with counts from active Nilam products. Context-sensitive facet counts and collection-detail facets remain open.
- [x] Add validated public catalogue filters for category, colour family, price range, and in-stock availability without exposing unpublished products. Pagination and stable newest/oldest/name sorting remain in the existing endpoint; facets and collection-detail filtering remain open.
- [ ] Extend public catalogue endpoints with validated, bounded `page`, `limit`, `sort`, `minPrice`, `maxPrice`, category, colour-family, availability, and collection filters. Return applied filters, facet counts, page metadata, and canonical sort/filter values.
- [ ] Ensure only active products with purchasable variants appear in public results; retain an explicit option to show sold-out products only when merchandising approves it.
- [ ] Add original product attributes needed for filtering and PDP facts: colour display name/swatches, size/fit, material, care, dimensions, badges, compare-at price, and related-collection/recommendation relationships.
- [ ] Add recommendation selection rules (same collection/category, compatible colour family, in-stock preference), with a deterministic fallback and no third-party behavioural profiling.

### Storefront

- [x] Populate category and colour controls from the public facets response, with a safe fallback while it is unavailable.
- [x] Add an accessible filter panel for sort, category, colour family, price range, and in-stock availability. Filter state uses URL search parameters and has a clear-filters recovery action; active-filter chips and a mobile modal/drawer remain open.
- [ ] Replace the current static collection toolbar with result count, sort menu, active-filter chips, clear-all action, and resilient loading/empty/error states.
- [ ] Build desktop filter sidebar and mobile modal/drawer. Include price range with currency formatting and facets for colour, category, availability, and approved product attributes; focus management, Escape, and Apply/Clear actions are required.
- [ ] Keep query state shareable and back/forward-safe through URL search parameters. Preserve filters when navigating product → collection.
- [ ] Upgrade product cards with original Nilam badges (new, sale, sold out where approved), sale/regular price treatment, variant/colour count, consistent image aspect ratios, and quick add only when the exact purchasable variant is unambiguous.
- [x] Use the API’s bounded pagination metadata to add an accessible “load more” control that preserves active filters and disables while a page request is in progress.
- [ ] Implement paginated “load more” or accessible pagination after API review; prevent duplicate requests and layout shifts.

## 3. Product detail page

- [x] Add an API-backed related-products rail using other active Nilam products in the same category, excluding the product being viewed and falling back to no rail when no suitable products exist.
- [x] Add selectable thumbnail gallery state, an inventory-capped quantity selector, multi-quantity add-to-cart, and a post-add link to the full cart. Mobile swipe/zoom/lightbox remain open work.
- [ ] Rework the gallery for selectable thumbnails, active-image state, mobile swipe/tap controls, zoom/lightbox only if it passes keyboard and reduced-motion requirements, and meaningful alt text from product media records.
- [ ] Make option selection robust: render colour and size/other option groups from variant data, disable impossible combinations, update price/SKU/media/stock as the selection changes, and explain unavailable choices.
- [ ] Display sale and regular price accurately, including a clear promotion label only when a real compare-at price exists. Never manufacture urgency, scarcity, reviews, or discounts.
- [ ] Add structured sections for description, material, fit/measurements, care, shipping/returns, and stock/dispatch guidance. Use accessible disclosures only where they improve mobile scanning.
- [ ] Add quantity selection with stock caps, pending/success/error state for add-to-cart, and a post-add choice to continue shopping or review the cart; preserve the cart drawer as a quick confirmation surface.
- [x] Add related/recommended Nilam products using the published-category recommendation endpoint; a recently viewed list remains pending privacy approval.
- [ ] Generate product-level title, description, canonical URL, Open Graph data, JSON-LD Product/Offer markup, and image dimensions from the API's published data.

## 4. Cart

- [x] Add `/cart` as the canonical full-page cart and link both the header drawer and post-add confirmation to it. Keep drawer and page synchronized through the existing cart context. The checkout control remains disabled until §5 is delivered.
- [x] Add recoverable mutation feedback to the cart page and revalidate the shared cart on browser-tab focus, so current API price/stock data replaces stale local presentation after changes or a return visit.
- [ ] Build item rows with media, product/variant details, unit price, sale treatment, stock-aware quantity stepper, remove action, and mutation/loading/error feedback. Revalidate availability and price after each cart change and on page focus.
- [ ] Show API-calculated item count, subtotal, discount, delivery estimate, tax note, and total. Clearly label estimates until checkout has a delivery address and method.
- [ ] Add voucher entry only when voucher rules are implemented; show server-returned validation feedback and allow removal without losing the rest of the cart.
- [ ] Provide delivery/postcode estimator only after the rate engine is ready; do not imply a promise the operation cannot fulfil.
- [ ] Build empty-cart, stock-changed, expired-cart, and cart-unavailable states with clear recovery actions. Add an optional related-product rail that never blocks checkout.
- [ ] Enforce a single primary “Checkout” path and a secondary continue-shopping path on all breakpoints.

## 5. Checkout and order creation

### Commercial decisions required before payment activation

- [ ] Approve shipping origins, serviceable zones, carriers/rates, handling times, free-shipping threshold, taxes, voucher policy, cancellation/refund policy, and customer-support escalation path.
- [ ] Select a payment service provider and document credentials ownership, webhooks, settlement/reconciliation, fraud controls, supported Indonesian methods, test mode, and failure/retry behaviour. Keep provider secrets server-side.

### Backend

- [ ] Add checkout quote endpoint that rehydrates the cart, validates stock and promotions, calculates authoritative delivery/totals, and expires stale quotes.
- [ ] Implement guest checkout first, with optional sign-in/registration; validate email, Indonesian phone format, recipient details, and address fields server-side.
- [ ] Implement idempotent order creation in a database transaction: lock/recheck inventory, snapshot all commercial data, decrement/reserve stock according to the approved policy, create order/order items/payment attempt, and prevent duplicate submission.
- [ ] Integrate payment through server-created payment intents/tokens plus signed webhook verification. Treat the webhook/provider as the payment-status authority; never trust a browser redirect alone.
- [ ] Add safe payment return/cancel routes, webhook replay protection, inventory release rules for expiry/failure/cancellation, receipt/email notification hooks, and operational audit events.

### Storefront

- [ ] Build a focused checkout shell separate from promotional navigation: Nilam mark, cart return link, support contact, and policy links.
- [ ] Implement a mobile-first progression: contact → delivery address → shipping method → payment → order review. Persist non-sensitive form progress locally for the session; never persist payment data.
- [ ] Requote when address, delivery, voucher, or cart changes; make changes to price, stock, or availability explicit and require acknowledgement before payment.
- [ ] Provide inline validation, an order-summary drawer on small screens, disabled/double-submit-safe payment controls, recoverable failure states, and a confirmation page with order number, summary, status, and next steps.
- [ ] Capture analytics only after consent and without sending payment, address, or other sensitive details to analytics vendors.

## 6. Customer authentication and account

- [ ] Decide whether customer sign-in is password-based only or also supports approved social/passwordless providers. Phase 3 defaults to email/password plus guest checkout to avoid blocking conversion.
- [ ] Add password hashing with a modern memory-hard algorithm, secure HttpOnly/Secure/SameSite session cookies, session rotation/revocation, email verification, password reset tokens with expiry/single use, login/reset throttling, and account-enumeration-safe responses.
- [ ] Implement registration, login, logout, forgot/reset password, and authenticated-session endpoints. Add email delivery templates and a development-safe mail transport/testing strategy.
- [ ] On authenticated sign-in, merge the anonymous cart using defined conflict/stock rules and report any unavailable quantities. Never silently overwrite an existing customer cart.
- [ ] Add `/account/login`, `/account/register`, `/account/recover`, `/account/reset`, and protected `/account` routes. The login view follows the reference's simple email/password, recovery, and sign-up pathways, with original Nilam wording and accessible feedback.
- [ ] Build account profile, password, address-book/default-address, and order-history/order-detail screens. Customers may access only their own data and order records.
- [ ] Wire the header account control to the correct signed-out/signed-in destination and preserve a safe `returnTo` destination after login.

## 7. Operations, observability, and migration

- [ ] Store all Nilam product, collection, and editorial storefront images in the `topan-media-prod` bucket and serve published objects only through `https://media-topan.fluxorastudio.id/topan-media-prod/<object-key>`. Do not retain production storefront media on third-party hotlink URLs or application-container filesystems.
- [x] Enforce bucket-only storefront media reads: public product, recommendation, collection, and cart responses now include only media rows with a managed object key. Temporary external image URLs were removed from seeds and frontend fallbacks; shoppers see a neutral placeholder until an ERP-managed WebP is uploaded.
- [x] Canonicalize all public media URLs from the configured media host, bucket, and stored object key rather than returning a database URL verbatim. This enforces the `https://media-topan.fluxorastudio.id/topan-media-prod/<object-key>` contract at the API boundary.
- [x] Add protected ERP media-migration reporting: the dashboard and `/api/admin/media/audit` identify managed-WebP versus legacy product-media records, so staff can track replacement work without serving legacy URLs publicly.
- [x] Add backend media-storage groundwork: `ProductMedia` records now support object key, content type, dimensions, byte size, and creation metadata; an authenticated product-media upload converts approved JPEG/PNG/WebP source files to WebP before storing them in the configured bucket path.
- [ ] Accept WebP for published storefront images only. The backend must validate MIME type, decoded image format, dimensions, and size; convert approved source uploads to WebP server-side where the approved workflow permits it; reject unsupported files before an object record is created.
- [x] Add initial authenticated ERP product-media controls for upload, preview/browse, alt text, position, and deletion, backed by audited API mutations. Replace/unpublish semantics and a standalone cross-product media library remain open.
- [ ] Add an authenticated ERP media library and product-media manager: upload, browse, search, assign/reorder, alt text, replace, unpublish, and safely delete only unreferenced objects. Object-storage credentials must remain server-side and all media changes must be audited.
- [ ] Create a migration plan for existing product/editorial URLs: inventory every reference, create WebP derivatives, upload with collision-safe object keys, update database records atomically after upload verification, and remove legacy/hotlinked references only after production verification and backup retention approval.
- [ ] Extend the ERP with read-only order list/detail, payment/fulfilment state visibility, customer contact/order history access, and audited authorised transitions. Separate Phase 3's customer flow from later refund/fulfilment automation if not approved.
- [ ] Create database migrations and a reversible rollout plan for order, payment, shipping, voucher, and authentication data. Validate against a fresh database and the development database before production.
- [ ] Add operational dashboards/alerts for checkout failures, payment webhook failures, stock conflicts, abandoned-checkout volume, email failures, and unusual login/reset activity—without exposing PII in alerts.
- [ ] Document customer-support procedures for payment pending/failed, duplicate order, stock conflict, address correction, cancellation, and password recovery cases.

## 8. Quality gate

- [ ] Add API integration tests for filters/facets, cart stock and price changes, checkout quote/order transaction/idempotency, payment webhook verification, sessions, password reset, authorisation, and anonymous-cart merge.
- [ ] Add browser tests for collection filters/sort/URL state, PDP media/options/add-to-cart, cart mutations, guest checkout validation, payment-return failure handling, login/recovery, account ownership, and mobile navigation.
- [ ] Test transaction concurrency so two customers cannot oversell the same SKU; test webhook retries and duplicate checkout submissions.
- [ ] Perform visual and interaction reviews at 375 px, 768 px, 1024 px, and 1440 px for all five surfaces; include slow network, empty, error, sold-out, and long-content cases.
- [ ] Complete WCAG 2.2 AA review: semantic form structure, visible labels, required/error messaging, logical focus order, focus traps, keyboard operation, target sizes, contrast, screen-reader announcements, and reduced motion.
- [ ] Meet performance budgets: responsive AVIF/WebP images, explicit media dimensions, lazy below-fold content, route-level splitting, no blocking third-party scripts before consent, and measured Core Web Vitals for collection/PDP/cart/checkout.
- [ ] Run dependency/security review, privacy review, payment-provider test-mode smoke tests, and a production rehearsal with no real charges before launch approval.

## Rollout order

1. Establish calculation/order/authentication rules and migrations; approve commercial and legal prerequisites.
2. Deliver the collection filters, PDP upgrades, and full cart route against the authoritative cart API.
3. Deliver guest checkout quoting and order creation in development, then payment test-mode and webhook handling.
4. Deliver customer authentication, cart merge, and account pages; expose order history after order records are stable.
5. Complete ERP visibility, automated tests, accessibility/performance/security review, staging rehearsal, then explicitly approve production payment activation.

## Definition of done

Phase 3 is complete when a customer can reliably discover a published Nilam product, select an available variant, maintain a stock-accurate cart, complete an approved payment through a secure guest-first checkout, receive a confirmed order, and later sign in to manage their profile, addresses, and own order history. All published storefront images are WebP objects in `topan-media-prod`, served through the approved media domain and managed through the audited ERP media workflow. The operation can reconcile payment and order state safely, all critical flows are covered by automated tests, and production payment collection is enabled only after commercial, legal, security, and provider approvals are recorded.
