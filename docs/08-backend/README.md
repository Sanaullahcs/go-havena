# Backend (Laravel 11)

The single API serving the mobile app and both dashboards. PHP 8.2+, MySQL 8, Sanctum auth. Lives in `backend/`.

## Project structure (conventions)

```text
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/Api/V1/      # thin controllers, one per resource
│   │   ├── Requests/                # FormRequest validation
│   │   ├── Resources/               # API Resources (response shaping → envelope)
│   │   └── Middleware/              # EnsureCommunityMembership, EnsureRole
│   ├── Models/                      # User, Profile, Community, Notice, Post, ...
│   ├── Actions/ or Services/        # business logic (BookAmenity, RedeemDeal, ...)
│   ├── Jobs/                        # SendOtpSms, SendPushNotification, RunContentModeration, AwardPointsAndBadges
│   ├── Policies/                    # authorization per model
│   ├── Notifications/               # push / sms / mail channels
│   └── Support/                     # ModerationService, PaymentService, PushService
├── routes/
│   ├── api.php                      # /api/v1 route groups by feature
│   └── channels.php                 # broadcast channel auth
├── database/
│   ├── migrations/                  # mirrors 04-data-model schema
│   ├── seeders/                     # demo community, users, content
│   └── factories/
├── config/
└── tests/                           # Feature + Unit (Pest/PHPUnit)
```

## Layering

```
Route → Middleware (auth:sanctum, community, role)
      → Controller (validate via FormRequest)
      → Action/Service (transaction, business rules)
      → Eloquent Model → MySQL
      → API Resource (response envelope)
      → dispatch Jobs (push, moderation, points) async
```

## Authentication & authorization

- **Sanctum** issues bearer tokens at the auth endpoints.
- `EnsureCommunityMembership` middleware resolves `X-Community-Id` / `{cid}`, asserts an `approved` membership.
- `EnsureRole`/Policies enforce role gates (member/moderator/admin) per [feature permission matrices](../03-features/).
- Recommended: **spatie/laravel-permission** for roles/permissions; scope by community via team feature or pivot.

## Cross‑cutting services (interfaces)

| Service | Responsibility | Default driver |
|---------|----------------|----------------|
| `ModerationService` | Score/flag content | `null` (allow) → pluggable AI |
| `PushService` | Expo push fan‑out | Expo Push API |
| `SmsService` | OTP delivery | Twilio |
| `PaymentService` | Reservations/marketplace charges | provider‑agnostic stub |
| `StorageService` | Signed media/doc URLs | S3 |

## Queues & scheduling

- Queue connection: `database` locally, `redis` in staging/prod.
- Scheduled tasks: expire deals/coupons, recompute leaderboards, prune OTPs, retention rollups.

## API documentation

- Contract: [../05-api/openapi.yaml](../05-api/openapi.yaml). Serve Swagger UI at `/api/docs` (non‑prod).
- Recommended generator: `dedoc/scramble` (auto‑generates OpenAPI from routes/FormRequests) **or** maintain the YAML by hand and validate in CI. Either way, the spec must match `routes/api.php`.

## Testing

- Feature tests per endpoint (happy path + auth/role/validation/conflict cases).
- Factories + seeders create a realistic demo community for local dev and tests.
- `php artisan migrate:fresh --seed` bootstraps a working dataset.

## Local setup (WAMP)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
# configure DB_* for WAMP MySQL, create database `havena`
php artisan migrate --seed
php artisan serve            # http://localhost:8000
php artisan queue:work       # process jobs
```
