# Environments & Configuration

## Environments

| Env | Purpose | API base URL (example) |
|-----|---------|------------------------|
| `local` | Developer machine (WAMP / `php artisan serve`, Expo dev, `next dev`) | `http://localhost:8000/api/v1` |
| `staging` | QA + design review against real devices | `https://staging-api.neighborlink.app/api/v1` |
| `production` | Live | `https://api.neighborlink.app/api/v1` |

> Local backend runs under WAMP at `D:\wamp64-330\www\Nbr-link\backend`. MySQL is the bundled WAMP MySQL 8 instance.

## API versioning

All endpoints are namespaced under `/api/v1/`. Breaking changes introduce `/api/v2/`; the OpenAPI `info.version` tracks the contract version.

## Configuration matrix

### Backend (`backend/.env`)
```dotenv
APP_NAME=NeighborLink
APP_ENV=local
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=nbrlink
DB_USERNAME=root
DB_PASSWORD=

QUEUE_CONNECTION=database        # redis in staging/prod
CACHE_STORE=database             # redis in staging/prod
BROADCAST_CONNECTION=reverb      # or pusher

SANCTUM_STATEFUL_DOMAINS=localhost:3000
SESSION_DOMAIN=localhost

# External services
TWILIO_SID=
TWILIO_TOKEN=
TWILIO_FROM=
GOOGLE_CLIENT_ID=
APPLE_CLIENT_ID=
EXPO_ACCESS_TOKEN=
AWS_BUCKET=
MODERATION_DRIVER=null           # null | openai | custom
```

### Mobile (`apps/mobile`, via `app.json` / `expo-constants` extra or `.env`)
```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_WS_HOST=localhost
```

### Frontend (`frontend/.env.local`)
```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

## Ports (local dev)

| Service | Port |
|---------|------|
| Laravel API | 8000 |
| Web portal (`frontend`) | 3000 |
| Expo dev server | 8081 |
| MySQL | 3306 |
| Reverb (WS) | 8080 |

## Secrets policy

- Never commit `.env`. Provide `.env.example` per app.
- Secrets are injected via the deployment platform in staging/prod.
- Do not commit files that may contain secrets (`.env`, `*.pem`, credentials).
