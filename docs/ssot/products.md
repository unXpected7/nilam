# Nilam product and catalogue data SSOT

Document type: Product/catalogue schema source of truth
Last verified: 2026-10-03, Asia/Jakarta
Implementation authority: backend/prisma/schema.prisma and checked-in Prisma migrations

This document describes the current database schema and behavior for products, variants, categories, collections, media, inventory, carts, and orders. The Prisma schema and migrations are authoritative if a field definition here becomes stale. This document records implementation, not aspirational features; planned work is labeled separately.

## 1. Product domain overview

A Product is the catalogue identity and customer-facing content record. It belongs to one Category and can have multiple ProductVariants, ProductMedia records, and Collection assignments. Each variant has a globally unique SKU and integer price. Inventory is tracked per variant. Cart items refer to variants. Order items preserve purchase-time name, SKU, price, and quantity snapshots, and may retain a nullable variant reference.

~~~mermaid
erDiagram
    Category ||--o{ Product : classifies
    Product ||--|{ ProductVariant : offers
    Product ||--o{ ProductMedia : displays
    Product ||--o{ ProductCollection : grouped_in
    Collection ||--o{ ProductCollection : contains
    ProductVariant ||--o| Inventory : stocked_as
    Inventory ||--o{ InventoryMovement : records
    Cart ||--o{ CartItem : contains
    ProductVariant ||--o{ CartItem : selected_as
    User o|--o{ Cart : owns
    User o|--o{ Address : has
    User o|--o{ Order : places
    Order ||--o{ OrderItem : contains
    ProductVariant o|--o{ OrderItem : purchased_as

    Category {
        string id PK
        string name
        string handle UK
    }
    Product {
        string id PK
        string name
        string handle UK
        string description
        string seoTitle nullable
        string seoDescription nullable
        ProductStatus status
        datetime archivedAt nullable
        string categoryId FK
        datetime createdAt
        datetime updatedAt
    }
    ProductVariant {
        string id PK
        string productId FK
        string name
        string sku UK
        int price
        datetime createdAt
    }
    ProductMedia {
        string id PK
        string productId FK
        string url
        string alt
        int position
    }
    Collection {
        string id PK
        string name
        string handle UK
        string description nullable
    }
    ProductCollection {
        string productId PK,FK
        string collectionId PK,FK
    }
    Inventory {
        string id PK
        string variantId FK,UK
        int quantity
        int lowStockThreshold
        datetime updatedAt
    }
    InventoryMovement {
        string id PK
        string inventoryId FK
        int previousQuantity
        int quantity
        int delta
        string reason
        string actor
        datetime createdAt
    }
    Cart {
        string id PK
        string userId FK nullable
        string sessionId UK nullable
        datetime createdAt
        datetime updatedAt
    }
    CartItem {
        string id PK
        string cartId FK
        string variantId FK
        int quantity
    }
    User {
        string id PK
        string email UK
        string firstName nullable
        string lastName nullable
    }
    Address {
        string id PK
        string userId FK
        string recipient
        string phone
        string line1
        string city
        string province
        string postalCode
    }
    Order {
        string id PK
        string userId FK nullable
        string email
        OrderStatus status
        PaymentStatus paymentStatus
        int subtotal
        int shipping
        int total
        datetime createdAt
    }
    OrderItem {
        string id PK
        string orderId FK
        string variantId FK nullable
        string name
        string sku
        int price
        int quantity
    }
~~~

ERD cardinalities:

- One category classifies zero or more products; each product requires one category.
- One product owns one or more variants by business invariant. Prisma permits the relation to be empty at the database level; admin API prevents deletion of the last variant.
- Product-to-collection is many-to-many through ProductCollection.
- Product-to-media is one-to-many.
- A variant has zero or one inventory row; the API creates inventory for variants it creates.
- Inventory can have zero or more movement rows. A movement is a before/after quantity audit record for one inventory row.
- A cart belongs to zero or one registered user and may instead be identified by a unique anonymous session ID. A cart contains variant-specific cart items.
- Orders belong to zero or one user and contain order item snapshots. Variant relation on an order item is optional so historical order data can remain if a variant is removed.

## 2. Entity/table dictionary

Names below are Prisma model names and, with the current Prisma defaults, are also PostgreSQL table names. IDs are String values generated with Prisma cuid() unless otherwise noted. Timestamp fields are PostgreSQL timestamp values.

### 2.1 Catalogue tables

#### Category

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | String, primary key, cuid | Category identifier |
| name | String, required | Display name |
| handle | String, unique, required | URL/category key |

Relation: Category 1 → many Product. Product.categoryId is required and there is no onDelete cascade configured for the category foreign key, so category removal is constrained while product rows refer to it. Admin API also explicitly blocks deletion when product count is nonzero.

#### Collection

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | String, primary key, cuid | Collection identifier |
| name | String, required | Display name |
| handle | String, unique, required | URL/collection key |
| description | String, nullable | Optional merchandising copy |

Relation: Collection joins to Product through ProductCollection. Admin API prevents deleting a collection that still has product assignments.

#### Product

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | String, primary key, cuid | Stable product identifier |
| name | String, required | Customer-facing product name |
| handle | String, unique, required | Public product URL key |
| description | String, required | Product body/description |
| seoTitle | String, nullable | Search/social title metadata |
| seoDescription | String, nullable | Search description metadata |
| status | ProductStatus, required, default DRAFT | Catalogue visibility state |
| archivedAt | DateTime, nullable | Time product entered archived state |
| categoryId | String, required FK → Category.id | Product’s single primary category |
| createdAt | DateTime, required, default now | Creation time |
| updatedAt | DateTime, required, auto-updated | Last update time |

ProductStatus enum: DRAFT, ACTIVE, ARCHIVED.

Behavior:

- Storefront product-list and product-detail endpoints query ACTIVE products only.
- Admin listing includes products regardless of status.
- Admin create/edit normalizes handles to lowercase hyphenated strings.
- On create with ARCHIVED status, archivedAt is set to current time.
- On edit, status ARCHIVED sets archivedAt once; moving to another status clears archivedAt.
- Product deletion is not currently exposed as an admin operation. Archiving is the intended reversible hide-from-storefront mechanism.
- A Product has one category, optional collections/media, and one-or-more variants by app-level rule.

#### ProductVariant

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | String, primary key, cuid | Variant identifier |
| productId | String, required FK → Product.id | Parent product |
| name | String, required | Customer selection label, e.g. size/color/style |
| sku | String, required, globally unique | Stock-keeping identifier |
| price | Int, required | Price in whole Indonesian rupiah |
| createdAt | DateTime, required, default now | Creation time |

Product deletion cascades to variants. Variant deletion is guarded in the admin API: a product must retain at least one variant, and a variant with cart-item or order-item references cannot be deleted. Each variant can have at most one Inventory record. Cart items refer to variants. OrderItem.variantId is nullable and uses onDelete SetNull.

Current admin operations:

| Method | Path | Effect |
| --- | --- | --- |
| POST | /api/admin/products/:id/variants | Create variant with name, SKU, price, optional opening quantity |
| PATCH | /api/admin/products/:productId/variants/:variantId | Update variant name, SKU, price |
| DELETE | /api/admin/products/:productId/variants/:variantId | Delete only if another variant remains and no cart/order references exist |

Price is represented as an integer, without a currency column; current business convention is IDR. Any multi-currency requirement needs a schema decision.

#### ProductMedia

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | String, primary key, cuid | Media row identifier |
| productId | String, required FK → Product.id | Parent product |
| url | String, required | Public or otherwise fetchable media URL |
| alt | String, required | Accessibility text |
| position | Int, required, default 0 | Gallery ordering |

Product deletion cascades to ProductMedia. Storefront detail returns ordered media rows; first media is used as card/cart image. There is no object key, media type, dimensions, upload actor, or storage state column yet. Nilam’s planned public object prefix is https://media-topan.fluxorastudio.id/topan-media-prod/. Upload API and protected MinIO credentials are not yet implemented.

#### ProductCollection

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| productId | String, composite primary key and FK → Product.id | Product member |
| collectionId | String, composite primary key and FK → Collection.id | Collection membership |

Composite primary key [productId, collectionId] prevents duplicate assignment of the same product to the same collection. Both foreign keys cascade on delete. Product create/edit accepts collectionIds; edits replace the set when the field is supplied and leave assignments unchanged when omitted. Empty array clears all assignments.

### 2.2 Inventory tables

#### Inventory

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | String, primary key, cuid | Inventory record identifier |
| variantId | String, required, unique FK → ProductVariant.id | One inventory record per variant |
| quantity | Int, required, default 0 | Current on-hand available quantity |
| lowStockThreshold | Int, required, default 5 | At-or-below value considered low stock |
| updatedAt | DateTime, required, auto-updated | Last inventory write |

Deleting the variant cascades to inventory. The low-stock condition is quantity <= lowStockThreshold. Admin stock changes are set-to-quantity operations, not additive increments.

#### InventoryMovement

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | String, primary key, cuid | Movement/audit identifier |
| inventoryId | String, required FK → Inventory.id | Inventory record changed |
| previousQuantity | Int, required | Quantity immediately before adjustment |
| quantity | Int, required | Quantity after adjustment |
| delta | Int, required | quantity minus previousQuantity |
| reason | String, required | Human-provided explanation |
| actor | String, required | Authenticated staff email responsible for the adjustment |
| createdAt | DateTime, required, default now | Adjustment time |

An index exists on inventoryId and createdAt. Inventory deletion cascades to movement history. Admin adjustment writes Inventory, InventoryMovement, and AdminAuditLog in one Prisma transaction. The movements endpoint returns the latest 100 rows for a variant.

### 2.3 Commerce tables connected to products

#### Cart

Fields: id (cuid PK), nullable userId FK, nullable unique sessionId, createdAt, updatedAt.

User deletion sets Cart.userId to null. A cart has many CartItems. Anonymous cart cookie name is nilam_cart; server marks it HttpOnly, SameSite=Lax, Path=/, and Max-Age 30 days. Secure is enabled when NODE_ENV is production.

#### CartItem

Fields: id (cuid PK), cartId FK, variantId FK, quantity Int default 1.

Unique constraint: [cartId, variantId], so one variant occupies one row per cart and repeat additions increase the row quantity. Cart deletion cascades to its items. Variant deletion is restricted by application behavior when referenced by carts.

#### Order

Fields: id (cuid PK), nullable userId FK, email, status, paymentStatus, subtotal Int, shipping Int default 0, total Int, createdAt, updatedAt.

OrderStatus: PENDING, PAID, FULFILLED, CANCELLED, REFUNDED.
PaymentStatus: PENDING, PAID, FAILED, REFUNDED.

Deleting a user sets Order.userId to null. Order has many OrderItems. Order creation and inventory reservation/stock decrement are not yet implemented.

#### OrderItem

Fields: id (cuid PK), orderId FK, nullable variantId FK, name, sku, price Int, quantity Int.

The name, SKU, and price fields are intended to be purchase-time snapshots. Deleting the order cascades to items. Deleting a variant sets the item’s variantId null; snapshot fields remain. Admin API currently blocks variant deletion when any order item refers to it.

## 3. Product data rules

These are current code rules and business conventions, not all database-enforced constraints:

1. Product handle is unique and is the public route key.
2. SKU is unique across all products/variants.
3. Product price is an integer >= 0 interpreted as IDR.
4. Inventory quantity and low-stock threshold are non-negative integers.
5. A product requires exactly one primary Category.
6. Collections are optional and many-to-many.
7. A published storefront product has status ACTIVE.
8. DRAFT and ARCHIVED products are excluded from public product queries.
9. Archiving is reversible; archivedAt is cleared on returning to DRAFT or ACTIVE.
10. Product must keep at least one variant according to admin delete logic.
11. A variant with cart or order references cannot be deleted through admin API.
12. Product/category/collection write paths record AdminAuditLog rows; stock updates also record InventoryMovement.
13. Category and collection handles are unique. Product and variant handle/SKU uniqueness errors ultimately rely on PostgreSQL unique constraints.

There are not yet database check constraints for non-negative quantity/price, non-empty strings, one variant per product, or consistency of InventoryMovement.delta. Keep validation in application code and consider adding database constraints for invariants that must hold under all writers.

## 4. Current product workflows and data flow

### 4.1 Seed

backend/prisma/seed.ts upserts Nilam sample categories by handle, then products by handle. Seed product updates name, description, category, and status. On create, a product includes one media URL, one Default variant/SKU/price, and inventory quantity. The seed also upserts a Jakarta store.

### 4.2 Public listing/search

GET /api/products accepts optional q and category. It filters to status ACTIVE, matches name/description case-insensitively for q, matches Category.handle for category, orders newest first, and returns a compact card DTO: id, handle, name, category display name, first/lowest variant price, first image URL, description.

### 4.3 Public detail

GET /api/products/:handle finds an ACTIVE product by unique handle and returns Category name, variants with inventory, all media ordered by position, and a convenience image field. Product page chooses a variant, reads its inventory quantity for availability, and posts that variant ID to the cart API.

### 4.4 Admin product create/edit

POST /api/admin/products accepts core product fields, category ID, status, SEO title/description, collection IDs, one initial SKU/price/quantity, and optional image URL. It creates the product, optional ProductCollection links, optional media row, default variant, and inventory row. The product mutation is logged.

PATCH /api/admin/products/:id updates product fields. If collectionIds is omitted, current assignment remains; if supplied, the set is replaced. Status changes synchronize archivedAt. The mutation is logged.

Variant CRUD lives under /api/admin/products/:id/variants. New variants receive inventory, defaulting opening quantity to zero when not supplied. Stock changes use PATCH /api/admin/inventory/:variantId with quantity, lowStockThreshold, and reason. A movement and audit log are written transactionally.

### 4.5 Cart

GET /api/cart creates or finds the anonymous/session cart and returns cart items enriched with variant SKU/name/price/available stock and product name/handle/first image.

POST /api/cart/items validates a positive whole quantity, checks that the product is ACTIVE, then checks available inventory before creating/updating the cart item.

PATCH /api/cart/items/:id sets quantity; zero deletes the item. Quantity above available inventory is rejected. DELETE removes a cart item.

The cart does not reserve stock. A checkout/order transaction must re-check and decrement inventory atomically.

## 5. API reference for catalogue data

All admin paths require an authenticated HttpOnly staff-session cookie and the server-enforced route permission. Request/response details should be confirmed in current backend/src/routes/admin.ts and backend/src/server.ts when changing this contract.

### Public reads

| Method/path | Purpose |
| --- | --- |
| GET /api/products?q=&category= | Active product card listing/search |
| GET /api/products/:handle | Active product detail with variants, stock, and media |
| GET /api/collections | Collection list with product counts |

### Admin catalogue

| Method/path | Purpose |
| --- | --- |
| GET /api/admin/products?q= | Product listing/search for ERP |
| POST /api/admin/products | Create product and initial default variant/inventory |
| PATCH /api/admin/products/:id | Edit product content, category, status, SEO, and optionally collection assignments |
| POST /api/admin/products/:id/variants | Add variant and inventory |
| PATCH /api/admin/products/:productId/variants/:variantId | Edit variant name/SKU/price |
| DELETE /api/admin/products/:productId/variants/:variantId | Guarded variant deletion |
| GET /api/admin/categories | List categories and product counts |
| POST /api/admin/categories | Create category |
| PATCH /api/admin/categories/:id | Edit category |
| DELETE /api/admin/categories/:id | Delete only an unused category |
| GET /api/admin/collections | List collections and product counts |
| POST /api/admin/collections | Create collection |
| PATCH /api/admin/collections/:id | Edit collection |
| DELETE /api/admin/collections/:id | Delete only an unassigned collection |
| GET /api/admin/inventory | Inventory rows, thresholds, and low-stock flag |
| PATCH /api/admin/inventory/:variantId | Set quantity/threshold with required reason |
| GET /api/admin/inventory/:variantId/movements | Latest 100 stock movement rows |

Pagination, stable sorting, and complete JSON schema validation are not yet standardized across these endpoints.

## 6. Migration history

Schema authority is backend/prisma/schema.prisma. Current checked-in migrations include:

| Migration | Change |
| --- | --- |
| 20261002035149_init | Initial commerce/catalogue schema |
| 20261002080000_inventory_movements | Inventory low-stock threshold and InventoryMovement history |
| 20261002090000_product_seo_archive | Product SEO title/description and archive timestamp |

Production deployment runs prisma migrate deploy in the backend container before starting Express. Every schema edit must include a migration. Apply and verify migrations in development before production.

## 7. Current gaps and future design choices

Implemented in current schema/API:

- Products, categories, collections, product-collection links
- Product media URL/alt/order metadata
- Multiple variants with unique SKUs and integer IDR price
- Per-variant stock, low-stock threshold, movement history
- Product SEO metadata and archive timestamp
- Product catalogue/cart linkage and order-item snapshot fields
- Admin audit log for catalogue and stock changes

Not yet implemented or incomplete:

- MinIO backend upload client, restricted non-root app credentials, upload validation, generated object keys, derivatives, and object cleanup.
- Admin image/media manager and database metadata for content type/dimensions/object key.
- Admin UI controls for SEO fields and full variant CRUD may not match all API capabilities; verify backend/admin-ui before declaring those screens available.
- Product archival safeguards for historical references/media; archive is currently a status/timestamp update.
- Order creation transaction, stock reservation/decrement/release, checkout and payment flow.
- Database check constraints and formal product attribute/option model.
- Currency field and tax/discount/price-history models.
- Category hierarchy or multiple categories per product.
- Product slug redirect/history when a published handle changes.
- Customer review/ratings, bundles, variants with structured option values, and warehouse/location-level stock.

Do not infer these as part of the current schema. Update this document alongside schema/migration changes when decisions are made.

## 7.1 Checkout, payment, shipping, and voucher update

The following schema is now present in `backend/prisma/schema.prisma` and checked-in migrations, although its public checkout APIs are still pending:

- `Order` has optional unique `orderNumber`, integer `discount`, `tax`, `shipping`, `total`, immutable JSON shipping address/method snapshots, `FulfillmentStatus`, payment attempts, optional shipment, and timeline events.
- `CheckoutQuote` stores a cart/user/email, immutable recipient and selected method snapshots, optional voucher code, integer totals, and expiry. Quotes are not yet created by an API.
- `PaymentAttempt` stores provider order/payment IDs, Snap token, amount, payment status/type, verified notification hash/time, and belongs to an order.
- `Shipment` stores the one current shipment per order, provider/service, unique tracking number, status, label URL, and timestamps.
- `OrderEvent` is an append-only order timeline with actor, request ID, safe payload, and timestamp.
- `Voucher` supports a unique code, percentage/fixed amount, minimum subtotal, maximum discount, active window, global usage cap/count, and active state. `VoucherRedemption` enforces one use per voucher per authenticated customer and optionally links a resulting order.

Current approved rules: online-only Indonesia delivery from postal code `52412`; Biteship rates limited to JNE/J&T; configurable 11% tax; voucher defaults of 20%, Rp200.000 minimum, Rp30.000 cap, seven-day expiry, and 4–6 alphanumeric code. Provider/checkout APIs must calculate all money server-side in integer IDR.

Additional migrations now present: `20261002100000_product_media_storage`, `20261002110000_customer_sessions`, `20261002120000_default_customer_address`, `20261002140000_payment_attempts`, `20261003090000_vouchers`, `20261003093000_voucher_redemptions`, and `20261003100000_checkout_order_snapshots`.

## 8. Editing guidance

- Change backend/prisma/schema.prisma, add a migration, update API validation/contracts, and update this SSOT as one coherent schema change.
- Preserve existing user changes and inspect git status before edits.
- Keep money fields integer-valued in IDR until multi-currency and decimal rules are explicitly designed.
- Keep durable order snapshots if product or variant data changes after purchase.
- Keep media upload credentials server-side and never store MinIO secrets in ProductMedia URLs or browser storage.
- Do not archive/delete product rows as a substitute for deleting order history.
- After schema changes, regenerate Prisma Client and rebuild the backend; deploy with migrations.







<!-- Before deployment, add the actual environment-specific values to vm01’s ignored, mode-600 file:

```
/home/vm01/nilam/postgres/.env
```

I did not copy local sandbox keys into production because the correct production credentials must remain distinct. -->
