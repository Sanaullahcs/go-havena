# API Conventions

The backend exposes a versioned REST API at `/api/v1`. The contract is documented in **[openapi.yaml](./openapi.yaml)** (OpenAPI 3.1) and served via **Swagger UI** at `/api/docs` in non‑production environments.

## Base URL & versioning

```
https://api.neighborlink.app/api/v1
```
Breaking changes → new version namespace (`/api/v2`). The OpenAPI `info.version` mirrors the contract.

## Authentication

- **Laravel Sanctum** bearer tokens. Send `Authorization: Bearer <token>` and `Accept: application/json`.
- Tokens are issued by auth endpoints and stored in secure storage (mobile) / httpOnly cookie (web).
- Most endpoints require an **active community context** via the `X-Community-Id` header (or path `{cid}` where present). The backend verifies the caller's approved membership + role for that community.

## Request headers

| Header | Required | Notes |
|--------|----------|-------|
| `Authorization` | yes (except auth/public) | `Bearer <token>` |
| `Accept` | yes | `application/json` |
| `Content-Type` | for writes | `application/json` or `multipart/form-data` (uploads) |
| `X-Community-Id` | for community‑scoped calls without `{cid}` | active community |
| `Idempotency-Key` | recommended for redeem/reserve | dedupes retries |

## Response envelope

Success (single):
```json
{ "data": { /* resource */ } }
```
Success (collection, paginated):
```json
{
  "data": [ /* items */ ],
  "meta": { "current_page": 1, "per_page": 20, "total": 137, "last_page": 7 },
  "links": { "next": "...?page=2", "prev": null }
}
```

## Error format

```json
{
  "message": "The given data was invalid.",
  "errors": { "email": ["The email field is required."] },
  "code": "VALIDATION_ERROR"
}
```

| HTTP | Meaning |
|------|---------|
| 200 / 201 | OK / Created |
| 204 | No content (deletes) |
| 401 | Unauthenticated |
| 403 | Authenticated but not permitted (role/membership) |
| 404 | Not found / out of scope |
| 409 | Conflict (e.g. double booking, already redeemed) |
| 422 | Validation error |
| 429 | Rate limited |

## Pagination, filtering, sorting

- `?page=` + `?per_page=` (default 20, max 100).
- Feature‑specific filters documented per endpoint (`?type=`, `?category=`, `?period=`, `?upcoming=1`).
- `?sort=-created_at` (prefix `-` = desc).

## Idempotency & concurrency

- Reservations and redemptions accept an `Idempotency-Key`; replays return the original result.
- Booking uses a transaction + row lock on the amenity/slot to prevent overbooking.

## Rate limiting

- Auth endpoints: strict (e.g. 5/min/IP for OTP).
- Authenticated writes: per‑user throttles. `429` returns `Retry-After`.

## Keeping the spec in sync

The OpenAPI file is the contract. When a route changes in Laravel, update `openapi.yaml` in the same PR. CI should validate the spec (lint) and may diff it against registered routes.
