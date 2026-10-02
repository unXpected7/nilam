# Nilam Marketplace

A full-stack marketplace starter: React + Vite frontend and Express + TypeScript API.

## Start

Open two terminals and install/run each app independently:

```bash
cd frontend
npm install
npm run dev
```

```bash
cd backend
npm install
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

The storefront runs at `http://localhost:5173`; the API runs at `http://localhost:4000`.

## Structure

```text
frontend/  Vite, React, TypeScript marketplace UI
backend/   Express, TypeScript JSON API
```

## Use the vm01 development database locally

The backend is configured to connect directly to the vm01 LAN address `192.168.100.35:5436`. Only the development database is exposed to the LAN; production remains VM-local.
