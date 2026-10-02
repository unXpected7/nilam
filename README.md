# Nilam

## Local access

Start each service from its own folder:

```sh
cd backend && npm run dev
```

```sh
cd frontend && npm run dev
```

- Storefront: http://localhost:5173/
- ERP admin (backend UI): http://localhost:4000/
- API health: http://localhost:4000/api/health

The ERP dashboard is plain HTML, CSS, and JavaScript in `backend/admin-ui/`. It is served by Express. Enter the value of `ADMIN_API_TOKEN` from `backend/.env`; the browser keeps it only for the current session.

## Structure

```text
frontend/        Vite, React, TypeScript storefront
backend/         Express, TypeScript API and ERP server
backend/admin-ui Plain HTML, CSS, JavaScript ERP dashboard
```

The backend development environment connects directly to the vm01 LAN database at `192.168.100.35:5436`. Only the development database is LAN-exposed.


<!-- npm run db:generate
npm run db:seed
npm run dev -->