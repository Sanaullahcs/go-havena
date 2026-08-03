# Havena — Monorepo

Havena is a hyperlocal community platform: **mobile app**, **web portal**, **Laravel API**, and **docs**.

## Repository layout

```text
go-havena/
├── apps/          # Mobile applications (React Native / Expo)
│   └── mobile/
├── frontend/      # Web portal — admin + resident in ONE Next.js codebase
├── backend/       # Laravel 11 API + MySQL
├── docs/          # Product, architecture, API, and feature specs
└── package.json   # Root scripts
```

## Quick start

```bash
# First-time setup — each app installs its own dependencies
npm run install:all

# Mobile (Expo)
npm run mobile

# Web portal (Next.js) → http://localhost:3000
npm run frontend

# API (Laravel) → http://localhost:8000
cd backend && composer install && cp .env.example .env && php artisan migrate
npm run backend
```

Dependencies are **not** hoisted to the repo root. Each JavaScript app keeps its own `package-lock.json` and `node_modules/`:

| App | Install location |
|-----|------------------|
| Mobile | `apps/mobile/` |
| Frontend | `frontend/` |
| Backend | `backend/` (Composer → `vendor/`) |

Root `package.json` is a **script runner only** — no root `node_modules`.

## Documentation

Start at [`docs/README.md`](docs/README.md).

## Tech stack

| Layer    | Technology              |
|----------|-------------------------|
| Mobile   | React Native (Expo 56)  |
| Frontend | Next.js 16 + Tailwind 4 |
| Backend  | Laravel 11 + Sanctum    |
| Database | MySQL 8                 |
