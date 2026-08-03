# Havena Web Portal

Single **Next.js** application serving both **Admin** and **Resident** experiences. One codebase, shared components, one API client — role-specific areas are separated by route groups.

## Routes

| Area | Base path | Audience |
|------|-----------|----------|
| Entry | `/` | Portal selector |
| Admin | `/admin/*` | Community operators |
| Resident | `/home`, `/notices`, `/feed`, … | Verified residents |

## Structure

```text
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Portal entry
│   │   ├── (admin)/              # Admin shell + /admin/* routes
│   │   └── (portal)/             # Resident shell + feature routes
│   ├── components/
│   │   ├── admin/                # Admin-only UI
│   │   └── portal/               # Resident-only UI
│   └── lib/
│       ├── api/client.ts         # Typed fetch → Laravel /api/v1
│       └── constants.ts
└── package.json
```

## Environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

## Scripts

From repo root:

```bash
npm run install:frontend   # first time
npm run frontend           # http://localhost:3000
npm run frontend:build
npm run frontend:lint
```

Or from this folder:

```bash
npm install
npm run dev
npm run build
npm run lint
```
