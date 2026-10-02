# Nilam — session handover / technical source of truth

Last updated: 2026-10-02 (Asia/Jakarta)

This document is for a new agent/model taking over Nilam. Treat it as the operational context for the project. Do **not** put passwords, database URLs containing passwords, GitHub runner registration tokens, Cloudflare tokens, or SSH private keys into commits or chat summaries.

## 1. Project purpose and local repository

Nilam is an original Indonesian modest-fashion marketplace. Its storefront is visually inspired by the information architecture and density of Elzatta, but Nilam must use its own branding, copy, data, and licensed/original assets. Do not copy the reference site’s logo, product content, images, or CSS.

Repository checkout on the developer Mac:

```text
/Users/faiz/Documents/private/nilam
```

Important local directories:

| Path | Responsibility |
| --- | --- |
| `frontend/` | Customer storefront: React 19, Vite, TypeScript, React Router |
| `backend/` | Express 5, TypeScript, Prisma, PostgreSQL API and backend-hosted ERP UI |
| `backend/admin-ui/` | Admin UI as plain HTML/CSS/JavaScript, served by Express — deliberately not React |
| `backend/prisma/` | Prisma schema and seed source |
| `deploy/vm01/app/docker-compose.yml` | Development/production application containers on vm01 |
| `deploy/nginx-public/` | Versioned Nginx virtual-host source for the public gateway |
| `.github/workflows/development.yml` | CI/CD for `main` → development |
| `.github/workflows/production.yml` | CI/CD for `prod` → production |
| `prompts/phase1.md` | Product/development plan and checklist |
| `prompts/handover/handover.md` | This document |

The worktree currently contains important uncommitted changes, including backend ERP routes/UI, Prisma additions, deployment/CI files, and storefront route/data work. Inspect with `git status --short`; preserve existing changes and commit them intentionally rather than resetting or checking out broadly.

## 2. Local developer workflow

The frontend and backend are independent npm projects. There is intentionally no root npm workspace command.

```sh
# terminal 1 — API + ERP UI
cd /Users/faiz/Documents/private/nilam/backend
npm install
npm run db:generate
npm run db:seed
npm run dev

# terminal 2 — customer storefront
cd /Users/faiz/Documents/private/nilam/frontend
npm install
npm run dev
```

Local addresses:

| Service | URL | Notes |
| --- | --- | --- |
| Storefront | `http://localhost:5173/` | Vite React UI |
| ERP admin | `http://localhost:4000/` | Plain backend HTML/CSS/JS UI, served by Express |
| API health | `http://localhost:4000/api/health` | Checks Prisma database connectivity |
| Admin APIs | `http://localhost:4000/api/admin/*` | Requires `x-admin-token` |

The ERP UI authenticates using `ADMIN_API_TOKEN` from the local `backend/.env` file and holds it only in browser session storage. A backend restart is required after modifying `.env`.

Useful checks:

```sh
cd backend
npm run lint
npm run build
node --check admin-ui/admin.js

cd ../frontend
npm run lint
npm run build
```

The local example database Compose service remains available:

```sh
cd /Users/faiz/Documents/private/nilam
docker compose up -d postgres
# PostgreSQL is localhost:5435
```

However, the active local `backend/.env` is configured to use vm01’s development database directly over the LAN. Do not use production credentials locally.

## 3. Application architecture

```text
Customer browser ──> Vite frontend locally / Nginx frontend container when deployed
                         │
                         └── /api/* ──> Express backend ──> Prisma ──> PostgreSQL

Admin browser ──> Express root (/; static backend/admin-ui)
                    │
                    └── /api/admin/* (x-admin-token) ──> Prisma ──> PostgreSQL
```

### Frontend

- React/Vite customer storefront only. Do not add the ERP back under `frontend/`.
- Main routes: `/`, `/collections/:handle`, `/products/:handle`, and `/search`.
- Storefront product requests use the backend API and have fallback product data for unavailable API/database states.
- Docker build serves it through Nginx; its Nginx template proxies `/api/` to the paired backend container.

### Backend and ERP

- `backend/src/server.ts` configures Express, CORS, JSON parsing, public product routes, protected admin routes, static `backend/admin-ui`, and the root ERP page.
- `backend/src/middleware/adminAuth.ts` verifies `x-admin-token` against `ADMIN_API_TOKEN` using timing-safe comparison.
- `backend/src/routes/admin.ts` currently provides:
  - `GET /api/admin/dashboard`
  - `GET|POST /api/admin/categories`
  - `PATCH|DELETE /api/admin/categories/:id`
  - `GET|POST /api/admin/collections`
  - `PATCH|DELETE /api/admin/collections/:id`
  - `GET|POST /api/admin/products`
  - `PATCH /api/admin/products/:id`
  - `GET /api/admin/inventory`
  - `PATCH /api/admin/inventory/:variantId`
- Admin UI currently supports token sign-in, dashboard metrics, product search/create/edit, category and collection create/edit/safe-delete, inventory listing, and audited stock adjustment.
- Product creation currently creates one `Default` variant, SKU, price, and opening inventory. Multi-variant and media management remain future work.
- Admin mutations insert `AdminAuditLog` records.

### Data model

`backend/prisma/schema.prisma` contains the initial marketplace entities:

- users, addresses
- categories, collections, product collections
- products, product variants, product media, inventory
- carts/cart items
- orders/order items
- stores, newsletter subscribers
- `AdminAuditLog`

Seed source: `backend/prisma/seed.ts`. It seeds original Nilam sample categories/products and the Jakarta store. The developer previously successfully ran `prisma generate` and `prisma db seed` against the configured development database.

## 4. Network, hosts, and PostgreSQL

### Infrastructure map

| Host | LAN / public IP | WireGuard IP | Purpose |
| --- | --- | --- | --- |
| Proxmox host (`pve`) | `192.168.100.27` | n/a | VM lifecycle / console access |
| vm01 | `192.168.100.35` | `10.10.0.2` | Nilam PostgreSQL, Docker app containers, GitHub Actions self-hosted runner |
| vm02 | `192.168.100.36` | verify before use | Separate VM; not part of Nilam deployment |
| Public gateway | `171.22.173.4` | `10.10.0.1` | Public Nginx and Cloudflare origin |

Use preconfigured SSH aliases such as `ssh vm01` where available. Do not record credentials in this file. If vm02 SSH is unavailable, access Proxmox and inspect/restart VM 100; it previously recovered after a restart.

### PostgreSQL on vm01

Remote Compose directory:

```text
/home/vm01/nilam/postgres
```

Remote private environment file:

```text
/home/vm01/nilam/postgres/.env
```

That file is the secret source of truth for VM database credentials and separate `DEV_ADMIN_API_TOKEN` / `PROD_ADMIN_API_TOKEN`. Keep it mode 600 and never commit it.

| Environment | Database container | Database name | Reachability |
| --- | --- | --- | --- |
| Development | `nilam-postgres-dev` | `nilam_dev` | vm01 LAN `192.168.100.35:5436`; Docker network port 5432 |
| Production | `nilam-postgres-prod` | `nilam_prod` | VM loopback `127.0.0.1:5437`; Docker network port 5432 |

The Mac backend can connect directly to development PostgreSQL through the LAN. It must not use a tunnel and must not connect to production.

Remote health commands:

```sh
ssh vm01 'cd ~/nilam/postgres && docker compose ps'
ssh vm01 'cd ~/nilam/postgres && docker compose up -d postgres-dev'
```

### Shared media object storage (vm02 MinIO)

MinIO is already deployed on vm02 and can be reused by Nilam; a second MinIO server is not required.

| Item | Current source of truth |
| --- | --- |
| VM | vm02 — LAN 192.168.100.36, WireGuard 10.10.0.3 |
| Container | social-minio (minio/minio) |
| Compose source | /home/vm02/social-media/docker-compose.yml |
| Persistent data | Docker volume social-media_minio_data mounted at /data |
| S3 API / console | Ports 9000 / 9001; currently published on vm02 |
| Existing public bucket | pmeme-media-prod, public read |
| Existing domain | media.pmemehandal.com |

Existing routing is Cloudflare → public Nginx 171.22.173.4 → vm01 Nginx bridge 10.10.0.2:9001 → vm02 MinIO 192.168.100.36:9000 → pmeme-media-prod.

For Nilam, use a separate bucket named topan-media-prod and a separate public hostname, media-topan.fluxorastudio.id. A bucket is not a hostname. The expected URL layout is https://media-topan.fluxorastudio.id/topan-media-prod/object-key.

Status on 2026-10-02: topan-media-prod has been created on vm02 and its anonymous-download policy was verified. The Cloudflare record is active, the public Nginx vhost is deployed, and the Let’s Encrypt certificate for media-topan.fluxorastudio.id is valid through 2026-12-31. An upload/fetch/delete health-check object passed end to end through Cloudflare. The versioned Nilam public-gateway vhost source is deploy/nginx-public/media-topan.fluxorastudio.id.

Remaining external changes:

1. Create Nilam-specific non-root MinIO credentials for backend uploads; never put root credentials in application code or browser JavaScript.
2. Add backend upload validation, object-key generation, image processing, and product-media persistence before exposing media uploads in the ERP.

Security follow-up: the current vm02 Compose file stores MinIO credentials directly in Compose initialization configuration and broadly publishes ports 9000/9001. Do not copy that pattern into Nilam. Use a mode-600 environment file, restricted app credentials, and consider internal/WireGuard-only port bindings after checking existing consumers.

## 5. Containers and CI/CD

vm01 has a registered GitHub Actions self-hosted runner:

```text
runner name: nilam-vm01
labels: self-hosted, linux, x64, nilam
service: actions.runner.unXpected7-nilam.nilam-vm01.service
runner dir: /home/vm01/nilam-actions-runner
```

Check it on vm01:

```sh
sudo ./svc.sh status
# run from /home/vm01/nilam-actions-runner
```

Because the runner is already on vm01, workflows must run Docker commands locally on the runner. They must **not** SSH back into vm01 or rely on `VM01_HOST`/SSH GitHub secrets. An earlier failure came from an incorrectly constructed SSH destination caused by missing such secrets.

Workflow behavior:

| Branch | Workflow | Result |
| --- | --- | --- |
| `main` | `.github/workflows/development.yml` | Lint/build, ensure `postgres-dev`, build/deploy `nilam-dev-frontend` and `nilam-dev-backend` |
| `prod` | `.github/workflows/production.yml` | Lint/build, ensure `postgres-prod`, build/deploy `nilam-prod-frontend` and `nilam-prod-backend` |

Deployed container bindings on vm01’s WireGuard address:

| Environment | Frontend | Backend |
| --- | --- | --- |
| Development | `10.10.0.2:8091` | `10.10.0.2:5100` |
| Production | `10.10.0.2:8092` | `10.10.0.2:5101` |

Deployment command equivalent:

```sh
docker compose --env-file "$HOME/nilam/postgres/.env" \
  -f deploy/vm01/app/docker-compose.yml up --build -d dev-frontend dev-backend
```

Use `prod-frontend prod-backend` for production. The app Compose file joins the external Docker network `postgres_default`.

## 6. DNS, TLS, and public Nginx

Cloudflare zone: `fluxorastudio.id`. The following proxied A records point to `171.22.173.4`:

| Purpose | Domain |
| --- | --- |
| Dev storefront | `dev-topan.fluxorastudio.id` |
| Dev backend / intended ERP | `dev-api-topan.fluxorastudio.id` |
| Production storefront | `topan.fluxorastudio.id` |
| Production backend / intended ERP | `api-topan.fluxorastudio.id` |

Public traffic path:

```text
Cloudflare → 171.22.173.4 Nginx (10.10.0.1 WireGuard) → vm01 (10.10.0.2) → container
```

TLS certificates were created with Certbot and are valid through 2026-12-31:

- Development certificate location: `/etc/letsencrypt/live/dev-topan-fluxorastudio-id/`
- Production certificate location: `/etc/letsencrypt/live/topan-fluxorastudio-id/`

Versioned virtual-host sources are in `deploy/nginx-public/`. After editing and copying them to the public gateway, always run:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

### Important unresolved public-routing mismatch

The backend ERP is now served by Express at the backend root (`/`). However, the current versioned `dev-api-topan...` and `api-topan...` Nginx configs route their root location to the **frontend** ports (8091/8092), while only `/api/` goes to backends (5100/5101).

Before public ERP deployment, change those two config files so:

```nginx
# development backend domain
location / { proxy_pass http://10.10.0.2:5100; }

# production backend domain
location / { proxy_pass http://10.10.0.2:5101; }
```

Keep the `/api/` routes pointing to the same respective backend ports. Then copy the configurations to the public gateway, test Nginx, and reload. This is required for:

- `https://dev-api-topan.fluxorastudio.id/` → backend ERP
- `https://api-topan.fluxorastudio.id/` → backend ERP

The storefront hostnames should continue routing their roots to frontend containers.

## 7. Current phase status and recommended next work

Read and maintain `prompts/phase1.md` as the detailed plan.

Already implemented:

- Vite React storefront shell, customer routes, catalogue fallbacks/API reads
- Express/Prisma base API and product persistence
- Development/production PostgreSQL separation on vm01
- Docker app definitions, public Nginx source files, Cloudflare records, TLS, and self-hosted CI/CD runner
- Backend-hosted token-protected ERP
- ERP dashboard metrics, categories CRUD with safe deletion, initial products create/edit, inventory adjustment audit logging

Highest-value next steps:

1. Commit the current worktree in coherent commits and push `main`; confirm the development Action completes and containers become healthy.
2. Fix the backend-domain Nginx root routing mismatch described above, then verify the public development ERP.
3. Extend ERP catalogue management: product-to-collection assignment, multi-variant SKU/price controls, product media upload, SEO fields, and archival safeguards.
4. Implement inventory movement history/low-stock thresholds and the order operations API/UI.
5. Add role-based authentication to replace the shared environment token.
6. Continue Phase 1 storefront editorial modules, static pages, cart persistence, validation/pagination, responsive/accessibility testing.

## 8. Operational safety rules

- Do not reset, clean, or overwrite the dirty worktree without explicit user approval.
- Do not use the production database from the Mac or expose production PostgreSQL to the LAN.
- Keep secrets in `backend/.env` locally and `/home/vm01/nilam/postgres/.env` on vm01 only.
- A backend API/ERP deploy requires the relevant branch to include the source changes; running a successful workflow on an old commit does not deploy local uncommitted changes.
- Verify generated Prisma client with `npm run db:generate` after schema changes and run `npm run build` before pushing.
- For Nginx/proxy changes, validate WireGuard reachability to `10.10.0.2:<port>` before assuming a Cloudflare issue.
