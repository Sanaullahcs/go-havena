# NeighborLink — Full-Stack Development Plan
> Real-time, end-to-end feature development across Admin Portal, Resident Portal, and Mobile App.

---

## Current Stack

| Layer | Technology | Status |
|---|---|---|
| Backend API | Laravel 11 + Sanctum | Running on WAMP (localhost) |
| Database | MySQL | Migrated, partial seed data |
| Admin Portal | Next.js 16 + Tailwind CSS v4 | UI complete, mock data only |
| Resident Portal | Next.js 16 + Tailwind CSS v4 | UI complete, mock data only |
| Mobile App | Expo SDK 56 + NativeWind v4 | Boilerplate, not started |

---

## What Already Exists

### Backend (Laravel)
- `users` table (extended: uuid, phone, status, softDeletes)
- `profiles` table (display_name, avatar_url, bio, unit_number)
- `communities`, `community_memberships`, `invite_codes`
- `conversations`, `conversation_participants`, `messages`
- `app_notifications`
- `activity_logs`
- **Controllers**: LoginController, ProfileController, CommunityController, MessageController, NotificationController, ActivityLogController

### Frontend (both portals)
- Full UI for every page — all currently using **static mock data**
- Centralized auth session (`getToken`, `getUser`, `clearSession`)
- SweetAlert2 integrated for all actions
- Recharts-based dashboards
- Chat module (`ChatShell`), Notification Bell, all page CRUD dialogs

---

## Features To Build — Prioritised

### Phase 1 — Foundation & Auth (Week 1)
Real auth wired end-to-end, role-based guards, token persistence.

### Phase 2 — Core Admin CRUD (Week 1–2)
Members, Notices, Moderation, Marketplace — real API calls replacing mock data.

### Phase 3 — Resident Core (Week 2)
Home/Dashboard stats, Notices viewer, Property & Amenities bookings, Profile save.

### Phase 4 — Social & Messaging (Week 2–3)
Community Feed (posts, likes, comments), real-time Chat (Pusher/Laravel Echo).

### Phase 5 — Notifications & Activity (Week 3)
Live notification bell from DB, activity log writes on every action.

### Phase 6 — Mobile App (Week 3–4)
Expo screens mirroring the resident portal features.

---

## Feature Specification (Feature by Feature)

---

### F-01 · Authentication & Session

**Scope**: Admin Portal · Resident Portal · Mobile

**Current state**: Login UI exists. `/api/v1/auth/login` works. Token stored in `localStorage`.

**What needs to be built**:
- Enforce role check on login response (`role === 'admin'` → admin portal, `role === 'resident'` → portal)
- Persist token correctly for mobile (SecureStore)
- Refresh token / silent re-auth on 401
- Logout calls `POST /api/v1/auth/logout` to revoke Sanctum token
- Password reset flow (forgot password email → reset link)

**Backend tasks**:
- [ ] `POST /v1/auth/forgot-password` — send reset email
- [ ] `POST /v1/auth/reset-password` — validate token + update password
- [ ] Add `role` to login response payload
- [ ] 401 middleware returns consistent JSON error

**Frontend tasks**:
- [ ] Wire login form → real API (`/api/v1/auth/login`)
- [ ] Read `role` from response, redirect accordingly
- [ ] Logout button calls `DELETE /api/v1/auth/logout`
- [ ] Show "Forgot password" link on login pages

**DB**: `users.status`, `personal_access_tokens` — already exists

---

### F-02 · Members Management (Admin)

**Scope**: Admin Portal → `/admin/members`

**Current state**: Table with mock data. Invite, Approve, Suspend dialogs are UI-only.

**What needs to be built**:
- List all members with filters (status: pending/approved/suspended, role, search)
- Approve / Suspend / Delete member
- Invite member (create user + send invite email)
- View member profile detail (drawer or page)

**Backend tasks**:
- [ ] `GET /v1/admin/members` — paginated list with filters (`status`, `role`, `search`, `community_id`)
- [ ] `POST /v1/admin/members/invite` — create user record + send welcome email
- [ ] `PATCH /v1/admin/members/{id}/approve` — set `community_memberships.status = approved`
- [ ] `PATCH /v1/admin/members/{id}/suspend` — set `community_memberships.status = banned`
- [ ] `DELETE /v1/admin/members/{id}` — soft-delete user
- [ ] `GET /v1/admin/members/{id}` — single member detail
- [ ] **Controller**: `MemberController`

**Frontend tasks**:
- [ ] Replace mock `MEMBERS` array with `useEffect` → `GET /v1/admin/members`
- [ ] Approve/Suspend/Delete buttons call real endpoints
- [ ] Invite form submits to `POST /v1/admin/members/invite`
- [ ] Loading skeleton while fetching
- [ ] Pagination connected to API `page` param

**DB**: `users`, `profiles`, `community_memberships` — exists

---

### F-03 · Notices Management (Admin + Resident)

**Scope**: Admin Portal → `/admin/notices` · Resident Portal → `/notices`

**Current state**: Admin has create/publish/delete UI (mock). Resident shows static notice cards.

**What needs to be built**:
- Admin: full CRUD — create, edit, publish, archive, delete notices
- Resident: list published notices, filter by category, mark as read
- Both: notice detail view

**Backend tasks**:
- [ ] **Migration**: `notices` table (`id`, `community_id`, `author_id`, `title`, `category`, `body`, `status: draft|published|archived`, `published_at`, `timestamps`)
- [ ] `GET /v1/notices` — list (residents see published only; admin sees all)
- [ ] `POST /v1/admin/notices` — create
- [ ] `PATCH /v1/admin/notices/{id}` — update / publish / archive
- [ ] `DELETE /v1/admin/notices/{id}` — delete
- [ ] `GET /v1/notices/{id}` — single notice
- [ ] **Controller**: `NoticeController`

**Frontend tasks**:
- [ ] Admin: fetch real notices, wire create/edit/delete/publish actions
- [ ] Resident: fetch and render published notices, category filter tabs
- [ ] Toast + SweetAlert on every action (already present, needs real API)

**DB**: needs `notices` migration

---

### F-04 · Moderation (Admin)

**Scope**: Admin Portal → `/admin/moderation`

**Current state**: Table with mock reports. Resolve/Escalate UI-only.

**What needs to be built**:
- List reports filed by residents
- Resolve, Escalate, Assign to moderator
- Residents can file a report from the Community Feed

**Backend tasks**:
- [ ] **Migration**: `reports` table (`id`, `community_id`, `reporter_id`, `reported_user_id`, `type: noise|harassment|damage|spam|other`, `description`, `status: open|resolved|escalated`, `resolved_by`, `resolved_at`, `timestamps`)
- [ ] `GET /v1/admin/reports` — paginated list with filters
- [ ] `PATCH /v1/admin/reports/{id}/resolve`
- [ ] `PATCH /v1/admin/reports/{id}/escalate`
- [ ] `POST /v1/reports` — resident files a report
- [ ] **Controller**: `ReportController`

**Frontend tasks**:
- [ ] Admin: replace mock data with real API, wire actions
- [ ] Resident: add "Report" button on Feed posts and user profiles

**DB**: needs `reports` migration

---

### F-05 · Marketplace (Admin + Resident)

**Scope**: Admin → `/admin/marketplace` · Resident → `/marketplace`

**Current state**: Both pages have full UI with mock listing cards. Admin can approve/reject. Resident can contact/save.

**What needs to be built**:
- Resident can create, view, save, contact on listings
- Admin can approve, reject, delete listings
- Image upload for listings
- Categories, search, filter

**Backend tasks**:
- [ ] **Migration**: `listings` table (`id`, `community_id`, `user_id`, `type: for_sale|service|wanted|deal`, `title`, `price`, `description`, `images: json`, `status: pending|approved|rejected`, `is_verified`, `timestamps`)
- [ ] `GET /v1/listings` — paginated, filtered by type/status/search
- [ ] `POST /v1/listings` — create listing (with image upload)
- [ ] `PATCH /v1/listings/{id}` — edit own listing
- [ ] `DELETE /v1/listings/{id}` — delete own listing
- [ ] `PATCH /v1/admin/listings/{id}/approve`
- [ ] `PATCH /v1/admin/listings/{id}/reject`
- [ ] `POST /v1/listings/{id}/save` — resident saves listing (toggle)
- [ ] `POST /v1/listings/{id}/contact` — sends message to listing owner
- [ ] **Controller**: `ListingController`

**Frontend tasks**:
- [ ] Admin: real data table, wire approve/reject/delete
- [ ] Resident: real listing grid, wire post/save/contact
- [ ] Image upload in "Post a Listing" modal

**DB**: needs `listings` migration; image storage (local disk or S3)

---

### F-06 · Community Feed (Resident)

**Scope**: Resident Portal → `/feed`

**Current state**: Full Facebook-like UI with mock posts. Like, Comment, Share are toggle-state only.

**What needs to be built**:
- Create / edit / delete posts
- Like / unlike posts (toggle)
- Comment on posts, delete own comments
- Share = copy link
- Filter by category (All / Events / Updates / Help)
- Pagination / infinite scroll

**Backend tasks**:
- [ ] **Migration**: `posts` table (`id`, `community_id`, `user_id`, `body`, `category`, `image_url`, `likes_count`, `comments_count`, `timestamps`)
- [ ] **Migration**: `post_likes` table (`user_id`, `post_id`, primary key composite)
- [ ] **Migration**: `post_comments` table (`id`, `post_id`, `user_id`, `body`, `timestamps`)
- [ ] `GET /v1/feed` — paginated posts (community-scoped)
- [ ] `POST /v1/feed` — create post
- [ ] `DELETE /v1/feed/{id}` — delete own post
- [ ] `POST /v1/feed/{id}/like` — toggle like
- [ ] `GET /v1/feed/{id}/comments` — list comments
- [ ] `POST /v1/feed/{id}/comments` — add comment
- [ ] `DELETE /v1/feed/{id}/comments/{commentId}` — delete comment
- [ ] **Controller**: `FeedController`

**Frontend tasks**:
- [ ] Replace mock posts with real API
- [ ] Like button calls real endpoint, updates count optimistically
- [ ] Post composer submits real POST
- [ ] Delete post/comment calls API + SweetAlert confirm

**DB**: needs `posts`, `post_likes`, `post_comments` migrations

---

### F-07 · Messaging / Chat (Admin + Resident)

**Scope**: Admin → `/admin/messages` · Resident → `/messages`

**Current state**: `ChatShell` UI complete with mock conversations and messages.

**What needs to be built**:
- Load real conversations from DB
- Load messages per conversation
- Send message (store in DB)
- Real-time delivery via Pusher (Laravel Echo)
- Unread count badge updates in real-time

**Backend tasks**:
- [ ] `GET /v1/conversations` — list user's conversations with last message ✓ (exists)
- [ ] `POST /v1/conversations` — start new conversation ✓ (exists)
- [ ] `GET /v1/conversations/{id}/messages` — paginated ✓ (exists)
- [ ] `POST /v1/conversations/{id}/messages` — send ✓ (exists)
- [ ] **Pusher/Echo**: broadcast `MessageSent` event on send
- [ ] **Pusher/Echo**: broadcast `ConversationUpdated` event
- [ ] Install & configure `pusher/pusher-php-server`
- [ ] Add `.env` Pusher keys

**Frontend tasks**:
- [ ] Replace mock data with `GET /v1/conversations`
- [ ] Real message load and send
- [ ] Subscribe to Pusher channel for real-time messages
- [ ] Unread badge updates live

**DB**: `conversations`, `messages`, `conversation_participants` — exists

---

### F-08 · Notifications (Admin + Resident)

**Scope**: Top-bar `NotificationBell` component (both portals)

**Current state**: Mock `ADMIN_NOTIFICATIONS` / `RESIDENT_NOTIFICATIONS` arrays in topbars.

**What needs to be built**:
- Fetch real notifications from DB on load
- Mark one / mark all as read (calls API)
- Push new notifications via Pusher
- Backend writes notification on each key event (member approved, new message, report filed, etc.)

**Backend tasks**:
- [ ] `GET /v1/notifications` ✓ (exists)
- [ ] `POST /v1/notifications/{id}/read` ✓ (exists)
- [ ] `POST /v1/notifications/read-all` ✓ (exists)
- [ ] `NotificationService` — helper to create notifications on events
- [ ] Broadcast `NotificationCreated` event via Pusher
- [ ] Wire notification creation into: member approve, message sent, report filed, notice published

**Frontend tasks**:
- [ ] Replace mock arrays in topbars with real `GET /v1/notifications`
- [ ] Mark-read calls real API
- [ ] Subscribe to Pusher `notifications.{userId}` channel

**DB**: `app_notifications` — exists

---

### F-09 · Activity Logs (Admin)

**Scope**: Admin Portal → `/admin/activity`

**Current state**: Full UI with mock logs. Filters, tabs, pagination are client-side only.

**What needs to be built**:
- Fetch real logs from DB
- Write logs on every significant admin action
- Stats tiles from real counts

**Backend tasks**:
- [ ] `GET /v1/activity-logs` ✓ (exists — paginate, filter by `type`, `severity`, `search`)
- [ ] `GET /v1/activity-logs/stats` ✓ (exists)
- [ ] `ActivityLogService::log(type, action, description, entity_type?, entity_id?, severity?)` — reusable helper
- [ ] Wire `ActivityLogService` into: login, member approve/suspend, notice publish, report resolve, marketplace approve

**Frontend tasks**:
- [ ] Replace mock `USER_LOGS`/`SYSTEM_LOGS` with real API
- [ ] Stats tiles use `/activity-logs/stats`
- [ ] Client filter state → API query params

**DB**: `activity_logs` — exists

---

### F-10 · Dashboard Stats (Admin + Resident)

**Scope**: Admin → `/admin` · Resident → `/home`

**Current state**: Hardcoded KPI numbers. Charts use static mock data.

**What needs to be built**:
- Admin: real counts for members, notices, reports, marketplace listings
- Admin: chart data from DB (daily activity, member growth, moderation trend)
- Resident: personal stats (posts, bookings, marketplace saves)

**Backend tasks**:
- [ ] `GET /v1/admin/dashboard/stats` — total members, pending approvals, open reports, active listings, recent activity (last 7 days grouped by day)
- [ ] `GET /v1/dashboard/stats` — resident personal stats
- [ ] **Controller**: `DashboardController`

**Frontend tasks**:
- [ ] Wire KPI tiles to real API
- [ ] Recharts fed with real time-series data from API

**DB**: aggregates from existing tables

---

### F-11 · Property & Amenities / Bookings (Resident)

**Scope**: Resident Portal → `/property`

**Current state**: Full tabbed UI (Amenities, Rules, My Bookings) with mock data. Booking modal exists.

**What needs to be built**:
- List amenities from DB
- Create / cancel bookings
- View "My Bookings" from DB
- Conflict detection (no double-bookings)

**Backend tasks**:
- [ ] **Migration**: `amenities` table (`id`, `community_id`, `name`, `description`, `status: open|closed|bookable`, `capacity`, `floor`, `image_url`, `hours`, `timestamps`)
- [ ] **Migration**: `bookings` table (`id`, `amenity_id`, `user_id`, `date`, `time_slot`, `guests`, `status: pending|confirmed|cancelled`, `timestamps`)
- [ ] `GET /v1/amenities` — list all amenities
- [ ] `GET /v1/bookings` — user's bookings
- [ ] `POST /v1/bookings` — create booking (with conflict check)
- [ ] `DELETE /v1/bookings/{id}` — cancel booking
- [ ] **Controller**: `AmenityController`, `BookingController`

**Frontend tasks**:
- [ ] Amenity cards fetched from API
- [ ] Booking modal submits real POST
- [ ] My Bookings tab loads real data, cancel calls DELETE + SweetAlert

**DB**: needs `amenities`, `bookings` migrations

---

### F-12 · Profile Management (Admin + Resident)

**Scope**: Both portals → `/profile` and `/admin/profile`

**Current state**: Edit form and password change are UI-only (no API call).

**What needs to be built**:
- Save profile changes via `PUT /v1/me`
- Upload profile photo
- Change password

**Backend tasks**:
- [ ] `GET /v1/me` ✓ (exists)
- [ ] `PUT /v1/me` ✓ (exists — needs to handle `name`, `phone`, `bio`, `unit_number`)
- [ ] `POST /v1/me/avatar` — upload avatar image, return URL
- [ ] `PUT /v1/me/password` — validate current password, update

**Frontend tasks**:
- [ ] Profile edit form submits to `PUT /v1/me`
- [ ] Camera button triggers upload → `POST /v1/me/avatar`
- [ ] Password change submits to `PUT /v1/me/password`
- [ ] Prepopulate form fields from `GET /v1/me` on page load

**DB**: `users`, `profiles` — exists

---

### F-13 · Wellness (Resident)

**Scope**: Resident Portal → `/wellness`

**Current state**: Basic page (not fully designed yet).

**What needs to be built**:
- Content categories (Fitness, Mental Health, Nutrition, Sleep)
- Lesson cards with progress tracking
- Mark lesson as complete
- Weekly wellness streak

**Backend tasks**:
- [ ] **Migration**: `wellness_content` table (`id`, `community_id`, `category`, `title`, `description`, `duration_min`, `image_url`, `timestamps`)
- [ ] **Migration**: `wellness_progress` table (`id`, `user_id`, `content_id`, `completed_at`)
- [ ] `GET /v1/wellness` — list content with user progress
- [ ] `POST /v1/wellness/{id}/complete` — mark complete
- [ ] **Controller**: `WellnessController`

**Frontend tasks**:
- [ ] Redesign wellness page with proper tabs and content cards
- [ ] Progress bar per category
- [ ] "Complete" button calls API

**DB**: needs `wellness_content`, `wellness_progress` migrations

---

### F-14 · Mobile App (Expo)

**Scope**: `apps/mobile/` — Expo SDK 56

**Current state**: Boilerplate only.

**Screens to build** (mirrors resident portal):
1. Onboarding / Login
2. Home Dashboard
3. Notices
4. Community Feed
5. Messages / Chat
6. Wellness
7. Marketplace
8. Property & Amenities
9. Profile
10. Notifications

**Architecture**:
- API service layer (`services/api.ts`) — shared Axios instance with token header
- React Query (`@tanstack/react-query`) for data fetching/caching
- Zustand for global state (user session)
- Expo SecureStore for token persistence
- Expo Notifications for push (FCM/APNs)

**Backend tasks for mobile**:
- [ ] `POST /v1/devices` — register FCM/APNs device token
- [ ] Expo push notification integration

---

## API Base URL Convention

```
Development:  http://localhost/Nbr-link/backend/public/api
Production:   https://api.neighborlink.app/api
```

All authenticated routes require:
```
Authorization: Bearer {token}
Accept: application/json
```

---

## Development Order (Recommended)

| # | Feature | Estimated Effort | Priority |
|---|---|---|---|
| 1 | F-01 Auth wiring | 1 day | Critical |
| 2 | F-12 Profile save | 0.5 day | High |
| 3 | F-02 Members CRUD | 1.5 days | High |
| 4 | F-03 Notices CRUD | 1 day | High |
| 5 | F-10 Dashboard stats | 1 day | High |
| 6 | F-04 Moderation | 1 day | Medium |
| 7 | F-05 Marketplace | 1.5 days | Medium |
| 8 | F-09 Activity logs | 0.5 day | Medium |
| 9 | F-06 Community Feed | 2 days | Medium |
| 10 | F-07 Messaging real-time | 2 days | Medium |
| 11 | F-08 Notifications live | 1 day | Medium |
| 12 | F-11 Amenities/Bookings | 1.5 days | Medium |
| 13 | F-13 Wellness | 1 day | Low |
| 14 | F-14 Mobile App | 5–7 days | Low |

**Total estimated**: ~21 days of focused development

---

## Notes

- Every API response follows the format: `{ data: ..., message: ..., meta: ... }`
- Every destructive action (delete/suspend) must write to `activity_logs`
- Every significant event must create an `app_notification` for the affected user
- Images: store to `storage/app/public` via `Storage::disk('public')`, return `/storage/...` URL
- Pagination: all list endpoints return `{ data: [], meta: { current_page, last_page, total, per_page } }`
- CORS: already configured for `localhost:3000`

---

*Last updated: June 22, 2026*
