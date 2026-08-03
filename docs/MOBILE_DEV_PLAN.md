# Havena Mobile App — Complete Development & Verification Plan
> End-to-end screen-by-screen guide. Every feature mapped from UI → API → backend. Includes verification test cases and a full list of missing screens to be built.

**Stack:** Expo SDK 56 · NativeWind v4 · Expo Router · Laravel 11 Sanctum API  
**Auth:** Phone OTP (Laravel `phone_otps` table) · `SecureStore` for token persistence  
**API Base:** `http://<LAN-IP>/go-havena/backend/public/api/v1`  
**Today:** June 22, 2026

---

## Test Accounts

| Role | Phone | OTP | Email | Status |
|------|-------|-----|-------|--------|
| Resident (Sarah) | `+15555555555` | `123456` | sarah@havena.app | Approved |
| Resident (David) | `+15555550002` | `123456` | david@havena.app | Approved |
| Resident (Pending) | `+15555550009` | `123456` | pending@havena.app | Pending |
| Resident (Suspended) | `+15555550011` | `123456` | banned@havena.app | Suspended |

> In dev: any phone matching `5555555555` bypasses real SMS and accepts OTP `123456`.

---

## Screen → API Map

| Screen File | API Endpoint(s) | Status |
|-------------|-----------------|--------|
| `app/index.js` | `/v1/me` (token check) | Wired |
| `screens/login/index.jsx` | `POST /v1/auth/otp/request` | Wired |
| `screens/login/verify-phone/index.jsx` | `POST /v1/auth/otp/verify` | Wired |
| `screens/signup/index.jsx` | `POST /v1/auth/otp/request` | Wired |
| `screens/verifyregistration/index.jsx` | `POST /v1/auth/otp/verify` | Wired |
| `screens/invite-code/index.jsx` | `POST /v1/communities/join-by-invite` | Wired |
| `screens/request-for-community/index.jsx` | `POST /v1/communities/request` | Wired |
| `screens/complete-profile/index.jsx` | `PUT /v1/me` | Wired |
| `(tabs)/home.jsx` | `GET /v1/dashboard/stats`, `GET /v1/me` | **TODO** |
| `(tabs)/notices.jsx` | `GET /v1/notices` | **TODO** |
| `screens/create-notice/index.jsx` | `POST /v1/admin/notices` | **TODO** |
| `screens/create-event/index.jsx` | `POST /v1/admin/notices` (category=event) | **TODO** |
| `screens/create-alert/index.jsx` | `POST /v1/admin/notices` (category=alert) | **TODO** |
| `screens/community-feed/index.jsx` | `GET /v1/feed` | **TODO** |
| `screens/community-feed/comments.jsx` | `GET /v1/feed/{id}/comments`, `POST /v1/feed/{id}/comments` | **TODO** |
| `screens/create-post/index.jsx` | `POST /v1/feed` | **TODO** |
| `(tabs)/marketplace/index.jsx` | `GET /v1/listings` | **TODO** |
| `screens/marketplace-listings/index.jsx` | `POST /v1/listings` | **TODO** |
| `(tabs)/wellness/index.jsx` | `GET /v1/wellness` | **TODO** |
| `screens/notification/index.jsx` | `GET /v1/notifications`, `POST /v1/notifications/{id}/read` | **TODO** |
| `screens/profile/index.jsx` | `GET /v1/me` | **TODO** |
| `screens/settings/index.jsx` | `POST /v1/auth/logout`, `PUT /v1/me` | **TODO** |
| `screens/property-management/index.jsx` | `GET /v1/dashboard/stats`, `GET /v1/amenities` | **TODO** |
| `screens/property-management/amenity/*` | `GET /v1/amenities`, `POST /v1/bookings`, `GET /v1/bookings` | **TODO** |
| `screens/property-management/my-booking/*` | `GET /v1/bookings`, `DELETE /v1/bookings/{id}` | **TODO** |
| **MISSING: Messaging** | `GET /v1/conversations`, `GET /v1/conversations/{id}/messages`, `POST /v1/conversations/{id}/messages` | **BUILD** |

---

## Feature 1 — Authentication (Phone OTP) ✅ Already Wired

### Verification Flow
1. Launch app → token in SecureStore → redirect to `/(tabs)/home`
2. No token → redirect to `/screens/login`
3. Enter `5555555555` → "Send Code" → `POST /v1/auth/otp/request` → 200 OK
4. Enter `123456` → "Verify" → `POST /v1/auth/otp/verify` → token + user stored
5. `membership.status === "approved"` → route to `/(tabs)/home`
6. `membership.status === "pending"` → route to restricted screen (show "waiting for admin approval")
7. User is `suspended` → show error modal "Your account has been suspended"

### Test Cases
- [ ] Phone `5555555555` → OTP request succeeds (dev bypass)
- [ ] OTP `123456` → verify succeeds, token stored in SecureStore
- [ ] App relaunch → token read → auto-navigate to home (no login shown)
- [ ] Logout → token cleared → relaunch shows login screen
- [ ] Suspended phone → error modal shown, navigation blocked

---

## Feature 2 — Home / Dashboard

### Screens
- `(tabs)/home.jsx` — main home screen
- `components/ui/top-bar.jsx` — shows real user name + avatar

### Real-Life Scenario
Sarah opens the app after login. She sees "Good morning, Sarah" with her real name pulled from `/v1/me`. Below that: quick stats (2 unread notices, 1 upcoming booking). Scrollable home sections show real notices, real feed posts, and real amenity info.

### API Wiring
```
GET /v1/me              → user name, avatar for TopBar
GET /v1/dashboard/stats → unread_notices, upcoming_bookings, unread_messages, feed_posts
GET /v1/notices         → first 3 notices for "Latest Notices" section
GET /v1/feed            → first 3 posts for "Community Feed" section
GET /v1/amenities       → amenities for "Property" section
```

### What To Build
- Wire `top-bar.jsx` to read name/avatar from session user (`getUser()`)
- Wire `home.jsx` to call `fetchDashboardStats()` → display stat cards
- Wire `Notices.jsx` home component to use API data
- Wire `communities.jsx` home component (feed previews) to API data

### Verification
- [ ] Top bar shows real user's first name
- [ ] Stat cards reflect actual DB counts
- [ ] Tapping a notice section item → navigates to notice detail
- [ ] Tapping a feed post → navigates to feed comments

---

## Feature 3 — Notices

### Screens
- `(tabs)/notices.jsx` — notice board list
- `screens/event-detail/index.jsx` — notice/event detail view
- `screens/create-notice/index.jsx` — admin create notice (text/announcement)
- `screens/create-event/index.jsx` — admin create event (with date/location)
- `screens/create-alert/index.jsx` — admin create alert (urgent)

### Real-Life Scenario
Sarah opens the Notices tab. She sees 4 notices: "Annual HOA Meeting" (pinned), "Pool Maintenance Alert" (urgent), and 2 community announcements. She taps one to open the detail view. She can RSVP to events.

Admin (from the floating nav → Create) creates a "Pool Closed for Cleaning" notice, fills title + body, sets category to "alert", publishes → all residents get an in-app notification.

### API Wiring
```
GET    /v1/notices                  → list all notices (with category filter)
GET    /v1/notices/{id}             → single notice detail
POST   /v1/admin/notices            → admin: create notice/event/alert
PATCH  /v1/admin/notices/{id}       → admin: edit notice
DELETE /v1/admin/notices/{id}       → admin: delete notice
```

### Category Mapping
| UI Tab | API `category` |
|--------|----------------|
| Announcements | `general` or `maintenance` |
| Events | `event` |
| Alerts | `emergency` |

### Verification
- [ ] Notices tab loads real data from API
- [ ] Category filter tabs work (All / Events / Alerts / Announcements)
- [ ] Pinned notices appear at top
- [ ] Admin can create a notice → appears in list
- [ ] Admin can delete a notice → disappears from list
- [ ] Resident receives notification when admin publishes notice

---

## Feature 4 — Community Feed

### Screens
- `screens/community-feed/index.jsx` — feed list
- `screens/community-feed/comments.jsx` — post comments
- `screens/community-feed/search.jsx` — search feed
- `screens/create-post/index.jsx` — compose new post

### Real-Life Scenario
Sarah opens Community Feed from the side menu. She sees posts from her neighbors: David's photo of the garden, an announcement from the admin, a question from another resident. She likes David's post (heart fills up). She taps "4 comments" to open the comment thread, reads comments, types her own, and hits Post.

### API Wiring
```
GET    /v1/feed                     → paginated feed posts
POST   /v1/feed                     → create post (body: { content, images? })
DELETE /v1/feed/{id}                → delete own post (or admin any post)
POST   /v1/feed/{id}/like           → toggle like
GET    /v1/feed/{id}/comments       → get comments for post
POST   /v1/feed/{id}/comments       → add comment
DELETE /v1/feed/{postId}/comments/{commentId} → delete comment
```

### Verification
- [ ] Feed loads real posts from DB
- [ ] Liking a post updates count immediately (optimistic UI)
- [ ] Comments load for a specific post
- [ ] New comment appears immediately after posting
- [ ] Creating a post → appears at top of feed
- [ ] Deleting own post removes it from list

---

## Feature 5 — Marketplace

### Screens
- `(tabs)/marketplace/index.jsx` — browse listings
- `(tabs)/marketplace/deal-details.jsx` — listing detail
- `screens/marketplace-listings/index.jsx` — create listing

### Real-Life Scenario
Sarah opens Marketplace. She sees listings: "Used Sofa $150", "Dog Walking Service $25/hr", "Parking Spot Rental $80/month". She taps on the sofa listing to see photos, description, and seller info. She saves it to her wishlist. Later she creates her own listing: "Bike for Sale $120", uploads a photo, sets category to "items", and publishes.

### API Wiring
```
GET    /v1/listings                 → all approved listings (filter: type, category)
POST   /v1/listings                 → create listing
PATCH  /v1/listings/{id}            → update own listing
DELETE /v1/listings/{id}            → delete own listing
POST   /v1/listings/{id}/save       → save/unsave listing (toggle)
```

### Listing Types
- `item` — physical goods for sale
- `service` — services offered
- `rental` — rentals (parking, storage)
- `wanted` — requests

### Verification
- [ ] Marketplace loads real listings from DB
- [ ] Listings filtered by category work
- [ ] Tapping listing shows detail view with real data
- [ ] Saving a listing persists across app restarts
- [ ] Creating a listing → appears in list (status: pending admin approval)
- [ ] Admin approves listing → status changes to approved

---

## Feature 6 — Wellness

### Screens
- `(tabs)/wellness/index.jsx` — wellness hub
- `(tabs)/wellness/wellness-detail.jsx` — category detail (courses list)
- `(tabs)/wellness/lessons.jsx` — lesson list in a course
- `(tabs)/wellness/lessonVedio.jsx` — video player

### Real-Life Scenario
Sarah opens Wellness. She sees her overall progress: "3 of 12 lessons completed (25%)". She taps "Exercise" category, sees 4 courses. She opens "Morning Stretch" course, sees a playlist of 6 lessons. She completes lesson 1 (marks it done). The progress bar updates.

### API Wiring
```
GET    /v1/wellness                 → all wellness content + user completion status
POST   /v1/wellness/{id}/complete   → mark lesson completed
DELETE /v1/wellness/{id}/complete   → unmark completion
```

### Response Shape (backend)
```json
{
  "data": [
    {
      "id": 1,
      "title": "Morning Stretch Routine",
      "category": "exercise",
      "description": "...",
      "video_url": "...",
      "duration_minutes": 15,
      "completed": false
    }
  ],
  "meta": {
    "total": 12,
    "completed": 3,
    "progress_pct": 25
  }
}
```

### Verification
- [ ] Wellness index shows real categories with real progress %
- [ ] Completing a lesson → progress bar updates
- [ ] Uncompleting a lesson → progress decreases
- [ ] Video player loads the `video_url` from backend

---

## Feature 7 — Property Management & Amenities

### Screens
- `screens/property-management/index.jsx` — overview with stats
- `screens/property-management/amenity/index.jsx` — amenity list
- `screens/property-management/amenity/all-facilities/index.jsx` — amenity detail
- `screens/property-management/amenity/all-facilities/reservation-calender/index.jsx` — book slot
- `screens/property-management/amenity/all-facilities/reservation-calender/rule-details/index.jsx` — rules & confirm
- `screens/property-management/my-booking/index.jsx` — my bookings list

### Real-Life Scenario
Sarah wants to book the community gym. She opens Property Management → Amenities → taps "Fitness Center". She sees hours, capacity, available time slots on a calendar. She picks tomorrow at 9am, reads the gym rules, acknowledges, and books. She gets a confirmation notification. Later she checks "My Bookings" and sees her booking. She can cancel up to 2 hours before.

### API Wiring
```
GET    /v1/amenities                → list amenities (name, capacity, hours, status)
GET    /v1/bookings                 → my bookings (upcoming + past)
POST   /v1/bookings                 → book amenity { amenity_id, date, time_slot }
DELETE /v1/bookings/{id}            → cancel booking
```

### Booking Payload
```json
{
  "amenity_id": 1,
  "date": "2026-06-25",
  "time_slot": "09:00"
}
```

### Verification
- [ ] Amenity list loads from API
- [ ] Booking a slot saves to DB and appears in "My Bookings"
- [ ] Cancelling a booking removes it from upcoming list
- [ ] Stats card in property-management shows correct upcoming booking count

---

## Feature 8 — Notifications

### Screens
- `screens/notification/index.jsx` — notification list

### Real-Life Scenario
Sarah sees a red badge (3) on the bell icon. She taps it. She sees: "Admin approved your listing", "David commented on your post", "New notice: Pool Maintenance". She taps the first one — it marks it as read (no badge). She taps "Mark all read" → all clear.

### API Wiring
```
GET    /v1/notifications                → list notifications (unread first)
POST   /v1/notifications/{id}/read      → mark single notification read
POST   /v1/notifications/read-all       → mark all notifications read
```

### Verification
- [ ] Notification screen shows real notifications from DB
- [ ] Unread notifications are visually distinct
- [ ] Tapping a notification marks it read
- [ ] Bell badge count reflects actual unread count
- [ ] "Mark all read" clears badge

---

## Feature 9 — Profile & Settings

### Screens
- `screens/profile/index.jsx` — profile overview
- `screens/settings/index.jsx` — settings + edit profile

### Real-Life Scenario
Sarah taps the avatar in the top bar. She sees her profile: "Sarah Mitchell", "Oak Valley Residences · Unit 4B", 1,250 points, badges, recent activity. She taps "Edit Profile" in settings, changes her display name, uploads a new avatar photo. She changes her password. She taps "Log Out" → confirmation → sent to login screen.

### API Wiring
```
GET    /v1/me                       → user profile (name, unit, community, points, avatar)
PUT    /v1/me                       → update name, unit_number, bio
POST   /v1/me/avatar                → upload avatar (multipart/form-data)
PUT    /v1/me/password              → change password
POST   /v1/auth/logout              → revoke token + clear session
```

### Verification
- [ ] Profile screen shows real user data (name, unit, community)
- [ ] Editing display_name → saves to DB → reflected on next load
- [ ] Avatar upload → displayed immediately
- [ ] Logout → navigates to login, token cleared, relaunch shows login

---

## Feature 10 — Messaging (MISSING SCREEN — BUILD)

### Screens to Create
- `app/screens/messages/index.jsx` — conversations list
- `app/screens/messages/[id].jsx` — individual chat

### Real-Life Scenario
Sarah wants to message David about his community post. She taps the message icon in the top bar. She sees her conversation list: "David Kim" (last message: "Thanks!"), "Admin" (last: "Your listing is approved"). She taps David's thread. She types "Hey, is the bike still available?" and hits Send. David's name and avatar are shown.

### API Wiring
```
GET    /v1/conversations                        → list conversations
POST   /v1/conversations                        → start conversation { user_id }
GET    /v1/conversations/{id}/messages          → messages in conversation
POST   /v1/conversations/{id}/messages          → send message { content }
```

### Message Shape
```json
{
  "id": 1,
  "conversation_id": 1,
  "sender_id": 5,
  "content": "Hey, is the bike still available?",
  "read_at": null,
  "created_at": "2026-06-22T09:00:00Z"
}
```

### Screen Design
- **Conversations List:** Avatar, name, last message preview, unread count badge, time
- **Chat Detail:** Full-screen chat, self messages right (blue), others left (gray), input bar with send button at bottom, scroll-to-bottom on new message

### Verification
- [ ] Conversations list loads from API
- [ ] Sending a message → appears immediately in chat
- [ ] Unread count badge visible on conversations list
- [ ] Message icon in top bar shows badge for unread conversations

---

## Feature 11 — Create Flows (Admin)

### Screens
- `screens/create-notice/index.jsx` → `POST /v1/admin/notices` (category: `general`)
- `screens/create-event/index.jsx` → `POST /v1/admin/notices` (category: `event`)
- `screens/create-alert/index.jsx` → `POST /v1/admin/notices` (category: `emergency`)
- `screens/create-post/index.jsx` → `POST /v1/feed`
- `screens/marketplace-listings/index.jsx` → `POST /v1/listings`

### Payload Mapping
```
create-notice:
  { title, body: description, category: "general", status: "published" }

create-event:
  { title, body: description + date + location, category: "event", status: "published" }

create-alert:
  { title, body: description, category: "emergency", status: "published" }

create-post:
  { content: postText }

marketplace-listing:
  { title, description, price, type: listingType, images[] }
```

### Verification
- [ ] Admin creates a notice → visible in Notices tab for all users
- [ ] Admin creates an event → shows in Events filter tab
- [ ] Admin creates an alert → shows in Alerts tab with urgent badge
- [ ] Resident creates a post → appears in Community Feed
- [ ] Resident creates a listing → appears in Marketplace (pending approval)

---

## Development Phases

### Phase 1 — Foundation (Current Sprint)
1. Create all API service files
2. Wire Home screen (real user name, stats)
3. Wire Notices tab
4. Wire Community Feed

### Phase 2 — Core Features
5. Wire Marketplace
6. Wire Wellness
7. Wire Property Management / Amenities

### Phase 3 — Social & Communication
8. Wire Notifications
9. Build Messaging screens (currently missing)
10. Wire Settings / Profile edit

### Phase 4 — Create Flows
11. Wire all create forms to API
12. Admin-specific: create notice/event/alert

### Phase 5 — Polish
13. Push notifications (Pusher/Expo Notifications)
14. Offline support / caching
15. Error handling edge cases
16. Performance: FlatList optimization, image caching

---

## Missing Screens to Build

| Screen | Priority | Notes |
|--------|----------|-------|
| `screens/messages/index.jsx` | HIGH | Conversations list — shown via top-bar icon |
| `screens/messages/[id].jsx` | HIGH | Chat screen with send input |
| `screens/notice-detail/index.jsx` | MEDIUM | Full notice detail (currently `event-detail` is used) |
| `screens/edit-profile/index.jsx` | MEDIUM | Dedicated edit screen (currently settings has a row) |

---

## Service Files to Create

```
apps/mobile/services/
  auth-api.js         ← exists ✓
  api-client.js       ← exists ✓
  auth-session.js     ← exists ✓
  feed-api.js         ← TODO: CRUD + likes + comments
  notices-api.js      ← TODO: list + show + admin CRUD
  listings-api.js     ← TODO: list + create + save toggle
  wellness-api.js     ← TODO: list + complete/uncomplete
  amenity-api.js      ← TODO: list amenities + bookings CRUD
  notifications-api.js← TODO: list + mark read
  messages-api.js     ← TODO: conversations + messages
  dashboard-api.js    ← TODO: resident stats
  profile-api.js      ← TODO: fetchMe, updateMe, uploadAvatar, changePassword
```

---

## Environment Notes

- Backend runs on WAMP at `http://192.168.x.x/go-havena/backend/public/api`
- Update `constants/api-config.js` with your LAN IP
- Run Expo on physical device on same WiFi, or use Android Emulator `10.0.2.2`
- All authenticated routes require `Authorization: Bearer <token>` header
- Community-scoped routes require `X-Community-Id` header (stored in SecureStore)

