# Web Portal (Frontend)

Single **Next.js** application at `frontend/` serving both **Admin** and **Resident** web experiences. This replaces the earlier plan for separate admin/user dashboard repos.

## Audiences

| Portal | Routes | Users |
|--------|--------|-------|
| **Admin** | `/admin`, `/admin/members`, `/admin/moderation`, … | Community admins & moderators |
| **Resident** | `/home`, `/notices`, `/feed`, `/wellness`, … | Verified residents |

Entry at `/` lets the user choose a portal (auth will gate this in Phase 1).

## Admin modules

| Route | Purpose |
|-------|---------|
| `/admin` | Overview KPIs |
| `/admin/members` | Approve/reject, roles, invite codes |
| `/admin/moderation` | Review queue |
| `/admin/notices` | Publish announcements/alerts/events |
| `/admin/marketplace` | Businesses, deals, listings |
| `/admin/analytics` | Engagement & retention |

## Resident modules

| Route | Purpose |
|-------|---------|
| `/home` | Dashboard highlights |
| `/notices` | Notice board |
| `/feed` | Community feed |
| `/wellness` | Resource hub |
| `/property` | Rules, documents, bookings |
| `/marketplace` | Deals & businesses |
| `/profile` | Profile & gamification |

## API integration

- Base URL: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000/api/v1`)
- Client: `frontend/src/lib/api/client.ts`
- Auth: Laravel Sanctum (httpOnly cookie or bearer token — TBD in auth phase)
- Community scope: `X-Community-Id` header

See [05-api](../05-api/) for the full contract.

## Development

```bash
npm run frontend        # from repo root
# or
cd frontend && npm run dev
```

Runs at **http://localhost:3000**.
