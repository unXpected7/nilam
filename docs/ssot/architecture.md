# Nilam system architecture

Document type: System source of truth (SSOT)
Last verified: 2026-10-02, Asia/Jakarta
Repository checkout: /Users/faiz/Documents/private/nilam

This document records the current Nilam system, including repository components, live hosts, networks, databases, storage, and delivery paths. It excludes passwords, access tokens, private keys, and complete secret-bearing connection strings. The locations of authoritative secret files are documented.

When this document and live infrastructure disagree, inspect the running service and source configuration, resolve the discrepancy, then update both. Preserve existing user changes in the repository.

## 1. System overview

Nilam is an Indonesian modest-fashion marketplace. Its system consists of a customer storefront, Express API, backend-hosted ERP interface, PostgreSQL, MinIO object storage, Cloudflare, public Nginx, and isolated development/production deployments.

    Customer/admin browsers
       └─ Cloudflare DNS + proxy
           └─ Public Nginx, 171.22.173.4 / WireGuard 10.10.0.1
               ├─ Dev storefront → vm01 10.10.0.2:8091 → dev frontend container
               ├─ Prod storefront → vm01 10.10.0.2:8092 → prod frontend container
               ├─ Dev backend host → vm01 10.10.0.2:5100 → dev Express container
               ├─ Prod backend host → vm01 10.10.0.2:5101 → prod Express container
               └─ Public media → vm01 10.10.0.2:9001 → vm02 192.168.100.36:9000 → MinIO

    Dev frontend / Express → vm01 PostgreSQL nilam_dev
    Prod frontend / Express → vm01 PostgreSQL nilam_prod
    GitHub Actions runner on vm01 → builds and deploys the environment selected by branch

The storefront is React/Vite. The ERP is plain HTML, CSS, and browser JavaScript under backend/admin-ui and served by Express at the backend root. There is no /admin URL path.

## 2. Repository layout

Repository: /Users/faiz/Documents/private/nilam

| Path | Responsibility |
| --- | --- |
| frontend/ | Customer storefront, React 19, Vite, TypeScript, React Router |
| frontend/src/pages/ | Home, collections/search catalogue, product detail |
| frontend/src/components/ | Storefront header, footer, product card, shared UI |
| frontend/src/lib/ | Product API access and fallback catalogue data |
| frontend/nginx/default.conf.template | Production SPA serving and internal /api proxy |
| backend/ | Express 5, TypeScript, Prisma, API and ERP server |
| backend/admin-ui/ | ERP static HTML/CSS/JS |
| backend/src/server.ts | Express routes, middleware, static ERP, server entry |
| backend/src/routes/admin.ts | Protected ERP management API |
| backend/src/middleware/adminAuth.ts | Admin token verification |
| backend/prisma/schema.prisma | PostgreSQL data model |
| backend/prisma/seed.ts | Original sample categories/products/store |
| deploy/vm01/app/docker-compose.yml | Four deployed app services and runtime configuration |
| deploy/vm01/ | vm01 deployment documentation |
| deploy/nginx-public/ | Versioned public gateway Nginx virtual hosts |
| .github/workflows/development.yml | Verification/deploy on main |
| .github/workflows/production.yml | Verification/deploy on prod |
| docker-compose.yml | Optional local PostgreSQL 16 on port 5435 |
| docs/ssot/architecture.md | This system architecture reference |
| docs/handover/handover.md | Session handover and current priorities |
| docs/plan/phase1.md | Phase 1 plan/checklist |
| docs/plan/phase2.md | Phase 2 plan/checklist and implementation status |

Frontend and backend are independent npm projects. Each owns package.json and its lockfile; there is no root workspace command. Inspect git status before editing: the checkout may contain uncommitted user work. Never clean or reset the worktree broadly.

## 3. Runtime architecture

### 3.1 Storefront

- Local Vite address: http://localhost:5173/
- Deployed frontend containers use Nginx to serve the Vite build.
- Routes include /, /collections/:handle, /products/:handle, and /search.
- Product reads accept the paginated API envelope and retain fallback catalogue data for unavailable API states.
- The frontend Nginx template proxies /api/ to the paired Express container using BACKEND_HOST and BACKEND_PORT.
- Main commerce UI is in progress. Checkout, payment, accounts, and all order/customer workflows are not complete.

### 3.2 Express API

- Local address: http://localhost:4000/
- API health: GET /api/health; it executes a database query and reports connectivity.
- Public endpoints currently include:
  - GET /api/products?q=&category=&page=&limit=&sort=newest|oldest|name
  - GET /api/products/:handle
  - GET /api/collections?page=&limit=
  - GET /api/stores?q=&page=&limit=
  - POST /api/newsletter
  - GET /api/cart
  - POST /api/cart/items
  - PATCH /api/cart/items/:id
  - DELETE /api/cart/items/:id
- Anonymous cart sessions use an HttpOnly nilam_cart cookie; cart and items are stored in PostgreSQL. Inventory availability is checked on item writes.
- CORS defaults to the local Vite origin; deployments set CLIENT_ORIGIN.
- Express serves backend/admin-ui static assets and serves its index at /, /dashboard, /products, /categories, /collections, and /inventory.

### 3.3 ERP/admin

Access paths:

| Environment | ERP base URL |
| --- | --- |
| Local | http://localhost:4000/ |
| Development | https://dev-api-topan.fluxorastudio.id/ |
| Production | https://api-topan.fluxorastudio.id/ |

The browser admin UI is static plain HTML/CSS/JS from backend/admin-ui. It uses a shared environment token, submitted as the x-admin-token request header and retained in sessionStorage for the browser session.

Current UI capabilities:

- Overview counts for active products, orders, pending orders, low-stock variants
- Product search, creation, and core-field/status editing
- Product create makes one Default variant with SKU, price, opening quantity, optional image URL, and collection assignments; existing products support multi-variant SKU/name/price controls.
- Category create/edit/delete; deletion is prevented while products reference the category
- Collection create/edit/delete; deletion is prevented while products reference the collection
- Inventory listing with configurable low-stock thresholds, reasoned quantity adjustments, and per-SKU movement history
- Audit log rows for category, collection, product, and stock mutations

Protected API endpoints, all prefixed /api/admin and guarded by admin token middleware:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /dashboard | Overview metrics |
| GET, POST | /categories | List/create categories |
| PATCH, DELETE | /categories/:id | Edit/delete unused category |
| GET, POST | /collections | List/create collections |
| PATCH, DELETE | /collections/:id | Edit/delete unused collection |
| GET, POST | /products | List/search/create products |
| PATCH | /products/:id | Edit product core fields/status and SEO metadata; ARCHIVED status records `archivedAt` |
| POST | /products/:id/variants | Create a SKU variant with opening inventory |
| PATCH, DELETE | /products/:productId/variants/:variantId | Edit or safely remove a variant |
| GET | /inventory | List variant stock |
| PATCH | /inventory/:variantId | Set quantity/low-stock threshold and record a reasoned adjustment |
| GET | /inventory/:variantId/movements | List the latest 100 immutable stock movements |

Auth is currently one shared token per environment, not staff identity/roles. Dashboard net sales is a placeholder. The product UI does not yet assign collections, manage multiple variants, upload media, or edit media after product creation. There is no order/customer operations interface yet.

### 3.4 Backend errors and validation

Admin routes validate required strings, enum status, category references, price, and quantities. The server currently maps any thrown Error to HTTP 400; unexpected Prisma/runtime errors should later be distinguished from client validation errors and logged with structured context.

## 4. Data architecture

### 4.1 Database

- PostgreSQL 16 Alpine containers on vm01.
- Prisma 6.17.1 is the ORM/client and backend schema source.
- Development and production have separate containers, databases, credentials, persistent volumes, and app environment.
- Deployed app containers connect over Docker network postgres_default using the PostgreSQL container DNS names and port 5432.
- The Mac backend uses the dev database directly over LAN by default through ignored backend/.env.
- Optional local PostgreSQL in root docker-compose.yml maps Mac port 5435 to container port 5432. It is not the active local backend DB unless DATABASE_URL is changed.

### 4.2 Schema

| Prisma model | Purpose |
| --- | --- |
| User | Customer identity and relations to addresses, carts, orders |
| Address | User shipping/contact address |
| Category | Product category with unique handle |
| Collection | Merchandising group with unique handle |
| Product | Name/handle/description, optional SEO title/description, publication status, archive timestamp, category, and relations |
| ProductVariant | Variant name, unique SKU, integer IDR price |
| ProductMedia | URL, alt text, ordering per product |
| ProductCollection | Many-to-many product/collection join |
| Inventory | Quantity and low-stock threshold associated with a variant |
| InventoryMovement | Immutable stock change with before/after values, delta, reason, actor, and timestamp |
| Cart | User or unique anonymous session |
| CartItem | Variant and quantity per cart |
| Order | Email, order/payment statuses, subtotal/shipping/total |
| OrderItem | Purchase-time product/SKU/price/quantity snapshot |
| Store | Store address, city/province, contact, coordinates |
| NewsletterSubscriber | Unique email subscription |
| AdminAuditLog | Actor, action, entity, entity ID, JSON payload, timestamp |

The seed inserts sample categories, products, default variants/inventory, and a Jakarta store. These are Nilam seed examples, not copied reference content.

### 4.3 Schema migrations

The backend image runs prisma migrate deploy before Express starts. New Prisma schema changes must be accompanied by checked-in migration files under backend/prisma/migrations. Use migrations for production changes; do not switch production to db push. Run Prisma client generation and backend build after schema edits.

## 5. Hosts and networks

| Host | LAN/public IP | WireGuard IP | Role |
| --- | --- | --- | --- |
| Proxmox host pve | 192.168.100.27 | — | VM lifecycle and console |
| vm01 | 192.168.100.35 | 10.10.0.2 | Nilam DBs, application Docker, GitHub runner, MinIO bridge |
| vm02 | 192.168.100.36 | 10.10.0.3 | Existing MinIO and unrelated services |
| Public gateway | 171.22.173.4 | 10.10.0.1 | Internet Nginx origin and Cloudflare target |

The WireGuard network is 10.10.0.0/24. The public gateway reaches app ports on vm01 over WireGuard. vm01 reaches MinIO on vm02 via LAN 192.168.100.36:9000. SSH aliases such as vm01 and vm02 are configured in the developer environment; do not include credentials here.

## 6. PostgreSQL deployments

Compose directory on vm01: /home/vm01/nilam/postgres
Private environment file: /home/vm01/nilam/postgres/.env (mode 600; authoritative DB/admin secrets; never committed)

| Environment | Container | Database | Host binding | Docker network |
| --- | --- | --- | --- | --- |
| Dev | nilam-postgres-dev | nilam_dev | 192.168.100.35:5436 → 5432 | postgres_default |
| Prod | nilam-postgres-prod | nilam_prod | 127.0.0.1:5437 → 5432 | postgres_default |

At last live inspection both were healthy. Development is intentionally LAN-accessible so the Mac can connect directly without a tunnel. Production host binding is loopback-only; local Mac must not use production DB.

Safe status command:

    ssh vm01 'cd ~/nilam/postgres && docker compose ps'

Do not display the remote env file or print secret values.

## 7. MinIO media storage

MinIO is shared on vm02; Nilam uses a separate bucket rather than another MinIO instance.

| Item | Current value |
| --- | --- |
| MinIO container | social-minio |
| Image | minio/minio:latest; observed release 2025-09-07 |
| Compose source | /home/vm02/social-media/docker-compose.yml |
| Persistent data | Docker volume social-media_minio_data mounted at /data |
| S3 API | vm02 port 9000, published on all host interfaces |
| Console | vm02 port 9001, published on all host interfaces |
| Existing other-application bucket | pmeme-media-prod, anonymous download |
| Nilam bucket | topan-media-prod, anonymous download |

vm01 Nginx bridge source/live path: /etc/nginx/sites-available/minio-proxy. It listens on vm01 port 9001 and proxies to vm02 LAN port 9000.

Nilam public media:

- Hostname: media-topan.fluxorastudio.id
- Object URL form: https://media-topan.fluxorastudio.id/topan-media-prod/<object-key>
- Bucket creation and anonymous-download policy were verified.
- Public vhost source in this repository: deploy/nginx-public/media-topan.fluxorastudio.id
- Public gateway vhost installed at /etc/nginx/sites-available/media-topan.fluxorastudio.id
- Routing: Cloudflare → 171.22.173.4 Nginx → 10.10.0.2:9001 → 192.168.100.36:9000
- Nginx only exposes /topan-media-prod/; other request paths return 404.
- CORS permits GET, HEAD, OPTIONS; responses have a week cache policy.
- Let’s Encrypt cert at /etc/letsencrypt/live/media-topan.fluxorastudio.id/, valid through 2026-12-31; renewal scheduled.
- An object was uploaded, downloaded over the public Cloudflare URL, and deleted as an end-to-end check.

Public-read bucket policy only grants download. Backend upload integration and a dedicated non-root MinIO identity/policy remain to be implemented. Never use MinIO root credentials in Nilam source, browser code, or docs. Existing MinIO credentials are controlled on vm02. Avoid changing MinIO port bindings until other consumers have been checked.

## 8. DNS, Nginx, Cloudflare, and certificates

Cloudflare zone: fluxorastudio.id. Application records are proxied to 171.22.173.4.

| Hostname | Role | Expected gateway upstream |
| --- | --- | --- |
| dev-topan.fluxorastudio.id | Dev storefront | 10.10.0.2:8091 |
| dev-api-topan.fluxorastudio.id | Dev ERP/API | 10.10.0.2:5100 |
| topan.fluxorastudio.id | Prod storefront | 10.10.0.2:8092 |
| api-topan.fluxorastudio.id | Prod ERP/API | 10.10.0.2:5101 |
| media-topan.fluxorastudio.id | Public Nilam media | 10.10.0.2:9001 |

The backend hostname must route both root and /api/ to its environment’s Express container so the ERP loads at the base URL. Check versioned api vhost configs before deployment; older configuration may have routed root to the frontend. Storefront hosts route root to frontend Nginx; frontend Nginx sends /api/ to Express.

TLS:

- Dev storefront/API certificate directory: /etc/letsencrypt/live/dev-topan-fluxorastudio-id/
- Prod storefront/API certificate directory: /etc/letsencrypt/live/topan-fluxorastudio-id/
- Media certificate directory: /etc/letsencrypt/live/media-topan.fluxorastudio.id/
- Last checked certificate expiry: 2026-12-31; Certbot automatic renewal is installed.

After a gateway Nginx change, run nginx -t and reload the service. Keep repository vhost files in sync with live configs.

## 9. Docker application topology

Repository Compose source: deploy/vm01/app/docker-compose.yml. All application containers attach to external Docker network postgres_default.

| Service/container | Container port | vm01 WireGuard publish | Upstream |
| --- | --- | --- | --- |
| dev-frontend / nilam-dev-frontend | Nginx 80 | 10.10.0.2:8091 | API → nilam-dev-backend:4000 |
| dev-backend / nilam-dev-backend | Express 4000 | 10.10.0.2:5100 | nilam-postgres-dev:5432 |
| prod-frontend / nilam-prod-frontend | Nginx 80 | 10.10.0.2:8092 | API → nilam-prod-backend:4000 |
| prod-backend / nilam-prod-backend | Express 4000 | 10.10.0.2:5101 | nilam-postgres-prod:5432 |

Backend runtime config includes PORT, CLIENT_ORIGIN, ADMIN_API_TOKEN, and DATABASE_URL. Frontend Nginx gets BACKEND_HOST and BACKEND_PORT. Environment substitutions come from vm01’s private Postgres .env file, not checked-in source.

Backend image: Node 24 Alpine; install, Prisma client generation, TypeScript build, prisma migrate deploy, then node dist/server.js.

Frontend image: Node 24 Alpine build; static Vite output copied into Nginx 1.27 Alpine.

## 10. Local workflow

Start backend API and ERP:

    cd /Users/faiz/Documents/private/nilam/backend
    npm install
    npm run db:generate
    npm run db:seed
    npm run dev

Start customer storefront separately:

    cd /Users/faiz/Documents/private/nilam/frontend
    npm install
    npm run dev

Local addresses:

| URL | Service |
| --- | --- |
| http://localhost:5173/ | Customer storefront |
| http://localhost:4000/ | ERP admin |
| http://localhost:4000/api/health | API + database health |

Local backend settings/secrets are in ignored backend/.env. Restart backend after changing .env. Do not paste its contents into chat or documentation.

Optional local PostgreSQL:

    cd /Users/faiz/Documents/private/nilam
    docker compose up -d postgres

The service maps host port 5435 to PostgreSQL container port 5432 and stores data in named volume nilam_postgres_data. The active local backend normally uses vm01 development DB directly instead.

Quality commands:

    cd backend && npm run lint && npm run build && node --check admin-ui/admin.js
    cd frontend && npm run lint && npm run build

## 11. CI/CD

GitHub repository: unXpected7/nilam.

Runner:

- Name: nilam-vm01
- Labels: self-hosted, linux, x64, nilam
- Directory: /home/vm01/nilam-actions-runner
- systemd service: actions.runner.unXpected7-nilam.nilam-vm01.service
- Workflows run on vm01 and invoke Docker Compose locally. They should not SSH back into the same host or require VM01_HOST/VM01_USER secrets.

Workflow matrix:

| Trigger | Workflow | On pull request | On push |
| --- | --- | --- | --- |
| main | .github/workflows/development.yml | npm ci; frontend lint/build; backend Prisma generate/lint | start dev DB; build/deploy dev frontend/backend |
| prod | .github/workflows/production.yml | same verification | start prod DB; build/deploy prod frontend/backend |

Node version is 24. GitHub Environments are development and production. Production environment should have reviewer protection configured.

Deployment command used by the development workflow:

    docker compose --env-file "$HOME/nilam/postgres/.env" +      -f deploy/vm01/app/docker-compose.yml up --build -d dev-frontend dev-backend

The production workflow substitutes prod-frontend and prod-backend. Workflow checkouts deploy only the pushed commit; local uncommitted changes do not deploy.

## 12. Secret ownership

| Secret type | Authoritative location |
| --- | --- |
| Local DB URL and local admin token | Ignored backend/.env on developer Mac |
| Dev/prod DB credentials and admin tokens | /home/vm01/nilam/postgres/.env on vm01, mode 600 |
| MinIO root credentials | vm02 MinIO deployment environment/configuration |
| SSH keys | Developer/host SSH agent or protected key storage |
| Cloudflare API credentials | Cloudflare account secret manager if configured |
| Runner registration token | One-time GitHub registration flow; never a persistent project secret |

Never commit secrets, include them in Docker build context, log them in Actions output, pass passwords as command-line arguments, or put storage write credentials in frontend JavaScript.

## 13. Current gaps and next work

1. Implement backend-only MinIO upload credentials with a bucket-scoped policy; validate file size/type; generate safe unique keys; store product media rows; define replace/delete cleanup.
2. Implement product image upload and media management in ERP.
3. Add product-to-collection assignment and multi-variant SKU/price/stock controls.
4. Replace shared admin token with user accounts, staff roles, secure sessions, CSRF protection, and actor-linked audit records.
5. Implement order operations, customers, fulfilment/refund flows, and real sales metrics.
6. Improve error handling so unexpected database/runtime errors are HTTP 500, not reported as client validation errors.
7. Add request validation, pagination, rate limiting, structured logs, readiness checks, DB backups and restore drills.
8. Verify versioned public backend host configs route root and /api to backend ports; verify the live configs match.
9. Complete storefront editorial modules, static content pages, accessibility/performance work, and remaining commerce flows.
10. Keep detailed progress in docs/plan/phase1.md and docs/plan/phase2.md, plus session transfer notes in docs/handover/handover.md.

Nilam must retain its own brand, product data, copy, imagery, and styling. Elzatta is a reference for information architecture and interaction patterns only; do not copy proprietary assets or text.

## 14. Operations quick reference

Inspect VM services:

    ssh vm01 'cd ~/nilam/postgres && docker compose ps'
    ssh vm01 'docker ps --filter name=nilam-'
    ssh vm02 'docker ps --filter name=social-minio'

Connectivity checks:

    # From vm01 to vm02 MinIO health endpoint
    curl -I http://10.10.0.3:9000/minio/health/live

    # From Mac to development PostgreSQL TCP endpoint
    nc -vz 192.168.100.35 5436

For public routing failures, inspect in this order: Cloudflare DNS/proxy, public Nginx host/TLS, WireGuard route, vm01 published port, container state/logs, database or MinIO dependency. A green CI workflow alone does not prove public traffic works.

For DB schema changes, create migrations and test against development before production deployment. Back up the relevant DB before risky migration work. Never run reset/drop/destructive seed operations against production.
