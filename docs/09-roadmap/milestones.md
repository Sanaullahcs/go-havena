# Roadmap & Milestones

The documentation in this folder is the **groundwork** (Phase 0). Development proceeds in phases; each phase has a clear Definition of Done (DoD).

## Phase 0 — Groundwork (this documentation) ✅

- [x] Product overview, value framework, glossary
- [x] Architecture: monorepo, tech stack, system diagram, environments
- [x] Design system: tokens + screen inventory (mapped to Figma) + navigation
- [x] Feature specs (7 + admin)
- [x] Data model: ERD + MySQL schema
- [x] API: conventions + OpenAPI 3.1
- [x] Mobile, dashboard, and backend structure docs

## Phase 1 — Foundations

1. **Monorepo layout:** `apps/mobile`, unified `frontend/` portal, `backend/`, `docs/`.
2. **Backend skeleton:** Laravel 11 install, MySQL schema migrations (from `04-data-model`), Sanctum, seeders, Swagger UI at `/api/docs`.
3. **Auth end‑to‑end:** email/phone(OTP)/Google/Apple register+login; profile; community join (invite + request); membership approval.
4. **Mobile API client + auth wiring:** secure token storage, `X-Community-Id`, guarded routes; biometric unlock.

**DoD:** a user can sign up, verify, join a community, and reach the home tabs against the real API.

## Phase 2 — Core community (P0 features)

- Digital Notice Board (CRUD + RSVP + push on announcement/alert).
- Community Feed (post/comment/react + moderation pipeline + realtime).
- Admin Dashboard: members, invite codes, moderation queue, notice publishing.

**DoD:** residents post/read feed & notices; admins moderate; announcements push.

## Phase 3 — Value modules

- Resource Hub (wellness pillars/courses/lessons + progress).
- Property Management (rules, documents, amenities, reservations).
- Neighborhood Marketplace (businesses, deals/coupons, redemption, reviews, listings).

**DoD:** each module is usable end‑to‑end on mobile + manageable in admin.

## Phase 4 — Engagement & polish

- Gamification (points ledger, badges, streaks, leaderboard) wired to engagement events.
- User Dashboard (web companion) feature parity subset.
- Analytics dashboard (engagement/retention/growth).
- Notifications center; performance, accessibility, and animation polish to match Figma.

**DoD:** points/badges/leaderboard live; web dashboard usable; analytics populated.

## Phase 5 — Hardening & launch

- Security review, rate limiting, audit logging coverage.
- Load testing, error monitoring, backups.
- App Store / Play Store submission; production infra.

## Cross‑phase Definition of Done (every feature)

- Matches its Figma frame(s) pixel‑for‑pixel.
- Endpoints present in `openapi.yaml` and implemented + tested.
- Permission matrix enforced server‑side.
- Data persisted per `04-data-model` schema.
- Errors follow the standard envelope; loading/empty/error states designed.

## Open questions / decisions to confirm

- Payment provider for reservations & marketplace (Stripe vs other).
- AI moderation provider (OpenAI moderation vs custom).
- Broadcasting: Laravel Reverb (self‑host) vs Pusher (managed).
- Multi‑community membership UX (switcher) priority for MVP.
- Whether resident peer **Listings** are in MVP or fast‑follow.
