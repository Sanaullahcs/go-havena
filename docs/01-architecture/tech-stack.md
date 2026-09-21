# Technology Stack

> These choices are **final** and override the "recommended stack" from the original product brief (which suggested Node/Python + PostgreSQL/Firebase). The team standard is **Laravel + MySQL**.

## Clients

### Mobile app — React Native (Expo)
- **Expo SDK 56**, React Native `0.85.x`, React `19.2`.
- **expo-router 56** for file‑based navigation (already in use).
- Key libs already in the project: `expo-image`, `expo-linear-gradient`, `expo-local-authentication` (biometrics), `expo-image-picker`, `expo-av` (wellness video), `expo-location`, `react-native-reanimated`, `lottie-react-native`, `react-native-progress`.
- Styling: React Native `StyleSheet` with a central `constants/font.js`. Brand blue `#007BFF` / `#0052DF`.

### Web portal — Next.js (`frontend/`)
- **One Next.js App Router** codebase for **Admin** and **Resident** experiences (route groups, not separate repos).
- TypeScript, Tailwind CSS (mirrors mobile design tokens).
- Shared API client in `src/lib/api/`; TanStack Query when data layers are added.
- Auth via Sanctum (httpOnly cookie for web; bearer token for mobile).
- Analytics charts via Recharts (admin module).

## Backend — Laravel 11
- **PHP 8.2+**, Laravel 11.
- **MySQL 8** as the primary datastore.
- **Laravel Sanctum** for API token auth (mobile + dashboards).
- **Spatie Laravel Permission** (recommended) for roles/permissions (resident/moderator/admin).
- Queues (database/Redis) for async work: SMS OTP, push notifications, AI moderation.
- Broadcasting (Laravel Reverb or Pusher) for realtime feed/notification updates.
- File storage: S3‑compatible (avatars, documents, business images, wellness media).
- API docs: **OpenAPI 3.1** served via Swagger UI; spec lives in `backend` and is mirrored in [05-api/openapi.yaml](../05-api/openapi.yaml).

## Cross‑cutting

| Concern | Technology |
|---------|------------|
| AuthN | Email+password, Phone (SMS OTP), Google OAuth, Apple ID; biometric unlock on device |
| AuthZ | Role + permission matrix per community (see each feature spec) |
| Notifications | Expo Push (mobile) + web push / in‑app; fan‑out via queued jobs |
| Realtime | WebSockets via Reverb/Pusher channels scoped to community |
| Media | S3 + signed URLs; image processing on upload |
| SMS | Twilio (or equivalent) behind a Laravel notification channel |
| Payments | Provider‑agnostic; abstracted behind a `PaymentService` (reservations, marketplace) |
| Search | MySQL full‑text first; upgrade path to Meilisearch/Elasticsearch |
| AI moderation | Pluggable moderation service interface (`ModerationService`) |

## Version pinning policy

- Expo: pin to SDK 56 patch range already in `package.json`. Read versioned docs before changing native APIs.
- Laravel: stay on 11.x; security patches applied promptly.
- Node: LTS via `.nvmrc`.
- Do not introduce a new core dependency without noting it here.
