# Havena — Mobile App · Complete Feature Plan
> Real-life, end-to-end scenario documentation. Every feature described from the perspective of both the resident (user) and the admin, covering the full journey from action to response.

**Stack:** Expo SDK 56 · NativeWind v4 · React Navigation (Expo Router) · Laravel 11 API  
**Auth:** Phone number OTP · Dummy credentials for development  
**Dev Phone:** `(555) 555-5555` · OTP: `123456`  
**API Base:** `http://<LAN-IP>/go-havena/backend/public/api/v1`

---

## Dummy Test Accounts (Development)

| Role | Phone | OTP | Notes |
|---|---|---|---|
| Resident (Sarah) | `(555) 555-5555` | `123456` | Approved member, Apt 4B |
| Resident (David) | `(555) 555-0002` | `123456` | Approved member, Apt 6D |
| Resident (Pending) | `(555) 555-0009` | `123456` | Pending approval — limited access |
| Resident (Banned) | `(555) 555-0011` | `123456` | Should see "account suspended" error |

> **Note:** OTP flow is phone-based. In dev, any phone matching the `DEV_TEST_PHONE_DIGITS` constant (`5555555555`) bypasses the real SMS and uses the hardcoded OTP `123456`. Other test phones must be added to the backend OTP table or handled via the dev bypass in `auth-api.js`.

---

## App Architecture

```
apps/mobile/
├── app/
│   ├── index.js                  ← Root redirect (checks auth → home or login)
│   ├── _layout.jsx               ← Root layout (font loading, auth guard)
│   ├── (tabs)/                   ← Bottom tab navigator (authenticated)
│   │   ├── home.jsx              ← Home / Dashboard
│   │   ├── notices.jsx           ← Community notices
│   │   ├── create-post.jsx       ← Compose a feed post
│   │   ├── (marketplace)/        ← Marketplace tab group
│   │   └── (wellness)/           ← Wellness tab group
│   └── screens/                  ← Stack screens (not in tabs)
│       ├── login/                ← Phone entry + OTP verify
│       ├── signup/               ← Registration flow
│       ├── community-feed/       ← Feed + comments
│       ├── profile/              ← My profile + edit
│       ├── notification/         ← Notification centre
│       ├── property-management/  ← Amenities + bookings
│       ├── settings/             ← App settings
│       └── ...
├── services/
│   ├── api-client.js             ← Fetch wrapper + ApiError
│   ├── auth-api.js               ← OTP, login, logout, profile
│   └── auth-session.js           ← SecureStore token + user
└── constants/
    └── api-config.js             ← Base URL + dev test phone/OTP
```

---

## Feature 1 — Authentication (Phone OTP)

### Real-Life Scenario
Sarah downloads the Havena app. She opens it and sees the welcome screen. She enters her phone number `(555) 555-5555` and taps "Send Code". A 6-digit OTP arrives by SMS (in dev: `123456` is pre-filled or shown as a hint). She enters the code, the app verifies it, and she lands on the Home screen. The next time she opens the app, she is auto-logged in — no need to enter her phone again.

### User Journey
1. **Splash / Root** → Check `SecureStore` for token → if exists, navigate to `/(tabs)/home` → if not, navigate to `/screens/login`
2. **Login Screen** → Phone input (US format, masked) → "Send Code" button
3. **OTP Screen** → 6-box OTP input → 60-second countdown → "Resend" option → "Verify"
4. **Post-login routing:**
   - Membership `approved` → `/(tabs)/home`
   - Membership `pending` → `/screens/invite-code` (restricted view, must wait for admin approval)
   - No membership → `/screens/invite-code` (enter invite code or request community)
   - Account `suspended` → show error modal, prevent login

### Admin Perspective
- Admin can see new logins in the Activity Logs (`/admin/activity`) → "User Activity" tab
- If a resident is `pending`, admin sees them in Members page with an "Approve" action
- Admin approves → resident gets a push notification → can now access full app

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/v1/auth/otp/request` | Send OTP SMS to phone |
| POST | `/v1/auth/otp/verify` | Verify OTP → return token + user |
| POST | `/v1/auth/logout` | Revoke Sanctum token |
| GET | `/v1/me` | Fetch current user profile |

### What Needs Building
- [ ] Wire `/v1/auth/otp/request` and `/v1/auth/otp/verify` to the backend (already exists in `auth-api.js`)
- [ ] Add phone column lookup in backend `OtpController` — map phone to user
- [ ] Add dummy phone entries for test accounts in a `DevOtpSeeder`
- [ ] Store token in `SecureStore` on verify success
- [ ] Root `index.js` token check → redirect
- [ ] Show "pending approval" restricted screen vs full home
- [ ] Show "account suspended" error on login

---

## Feature 2 — Home / Dashboard

### Real-Life Scenario
Sarah opens the app after login. She sees a personalized greeting "Good morning, Sarah". Below that are quick-stat cards: 2 unread notices, 1 upcoming booking, 5 new feed posts since her last visit. A "Latest Notice" preview card is visible at the top. Below are quick-access tiles to Marketplace, Community Feed, Amenities, and Wellness. Scrolling down she sees "Recent Activity" — showing the last 3 community posts.

### User Journey
1. App calls `GET /v1/dashboard/stats` on mount
2. Displays stat cards (unread notices, upcoming bookings, feed posts, unread notifications)
3. Displays "Latest Notice" preview (most recent published notice)
4. Quick-access tiles with unread badges
5. Recent feed posts (3 items, truncated) with "See all" → navigates to Feed

### Admin Perspective
- Admin dashboard at `/admin` shows the same data from a community-wide lens (total members, open reports, active listings, published notices)
- Admin has no mobile app dashboard — admin management is web-only

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/dashboard/stats` | Resident personal + community stats |
| GET | `/v1/notices?status=published&per_page=1` | Latest notice preview |
| GET | `/v1/feed?per_page=3` | Recent feed posts |

### What Needs Building
- [ ] Wire `fetchResidentStats()` API call on `home.jsx` mount
- [ ] Build stat cards UI with real counts (unread notices, bookings, feed posts, notifications)
- [ ] Latest Notice preview card → tapping navigates to full notice
- [ ] Quick-access grid (4 tiles) with live badges
- [ ] Recent posts strip (3 items) with "View all"
- [ ] Pull-to-refresh

---

## Feature 3 — Community Notices

### Real-Life Scenario
The admin publishes a notice: "Water will be shut off June 25, 9 AM – 1 PM." All residents immediately receive a push notification. Sarah opens the app, taps the notification, and is taken directly to the notice detail. She can see the full notice, the category (Maintenance), when it was published, and who published it. There is a filter bar at the top so she can browse All / General / Emergency / Event / Maintenance notices.

### User Journey
1. **Notices tab** (`/(tabs)/notices.jsx`) → list of published notices, newest first
2. Filter bar: All / General / Emergency / Event / Maintenance / Security
3. Tapping a notice → full detail screen with title, body, category badge, author, date
4. Unread indicator on notice cards (first time viewing marks as read)
5. Emergency notices appear at the top with a red banner regardless of filter

### Admin Perspective
- Admin creates notice at `/admin/notices` → sets title, body, category, status (draft or publish now)
- On "Publish" → backend auto-creates an `app_notification` for every approved community member
- Admin can archive notices (they disappear from the resident view)
- Admin sees notice open rates (future enhancement)

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/notices?status=published` | List published notices |
| GET | `/v1/notices/{id}` | Single notice detail |

### What Needs Building
- [ ] Wire `fetchNotices({ status: 'published' })` in `notices.jsx`
- [ ] Category filter bar (horizontal scroll chips)
- [ ] Notice list item component with category color badge and relative time
- [ ] Notice detail screen (full body, author, date, category)
- [ ] Emergency notices sorted to top with red accent
- [ ] Empty state when no notices exist

---

## Feature 4 — Community Feed (Social Wall)

### Real-Life Scenario
David opens the feed and sees 6 recent posts from neighbors. The top post is from Sarah: "Had an amazing time at the BBQ!" with 12 likes. David taps the heart to like it. He scrolls to a post from the admin welcoming a new resident. He wants to say hi — taps "Comment", types "Welcome to the building!", and submits. The comment appears instantly. He decides to make his own post — taps the compose button at the bottom, types "Anyone free this Sunday for a game of tennis?", selects category "Event", and posts. His post appears at the top of the feed.

### User Journey
1. **Feed screen** (`/screens/community-feed/index.jsx`)
   - Paginated list (10 per page, infinite scroll)
   - Filter chips: All / Events / Updates / Help / Announcements
   - Each post card: author avatar (initials), name, unit, time, body (truncated at 3 lines → expand), image (if any), like count, comment count
2. **Like** → tap heart → optimistic update → `POST /v1/feed/{id}/like` → toggle liked state
3. **Comments** → tap comment count → inline comment section expands → shows all comments → comment input at bottom
4. **Add comment** → type → "Send" → `POST /v1/feed/{id}/comments` → comment appears immediately
5. **Delete own post** → long-press on own post → "Delete Post" option → confirm → `DELETE /v1/feed/{id}`
6. **Delete own comment** → swipe or long-press → `DELETE /v1/feed/{postId}/comments/{commentId}`
7. **Compose** → tap FAB (floating action button) or `create-post.jsx` tab → select category → type → post

### Admin Perspective
- Admin can see all posts in `/admin/moderation` queue if flagged
- Residents can flag a post → creates a report of type "spam" pointing to the post
- Admin resolves → post is either kept or removed
- Admin can also post to the feed (shows as "Admin Office" with a shield badge)

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/feed` | Paginated posts |
| POST | `/v1/feed` | Create post |
| DELETE | `/v1/feed/{id}` | Delete own post |
| POST | `/v1/feed/{id}/like` | Toggle like |
| GET | `/v1/feed/{id}/comments` | Fetch comments |
| POST | `/v1/feed/{id}/comments` | Add comment |
| DELETE | `/v1/feed/{postId}/comments/{commentId}` | Delete own comment |

### What Needs Building
- [ ] Wire `fetchFeed()` with pagination in `community-feed/index.jsx`
- [ ] Post card component (avatar, name, unit, time, body, expand, image, like/comment counts)
- [ ] Like button with optimistic toggle + API call
- [ ] Comment section (lazy load when expanded) with `fetchComments()`
- [ ] Add comment form (sticky at bottom of comment view)
- [ ] Long-press context menu (delete own post / report post)
- [ ] Create Post screen (`create-post.jsx`) — textarea + category selector + post button
- [ ] Pull-to-refresh + infinite scroll (load more on scroll to bottom)
- [ ] "Flag post" → calls `POST /v1/reports` with type "spam"

---

## Feature 5 — Marketplace

### Real-Life Scenario
Lisa wants to sell her dining table. She taps Marketplace → taps "+" → fills in title "IKEA Dining Table Set", price "$180", description, type "For Sale" → submits. She sees a "Pending review" badge on her listing. The admin is notified and reviews it at `/admin/marketplace`. The admin approves it. Lisa gets a push notification: "Your listing is now live!" Other residents now see her table in the marketplace. Carlos taps on it, reads the description, taps "Contact Seller" → a modal shows Lisa's unit number with an option to send a message.

### User Journey
1. **Marketplace home** (`/(tabs)/marketplace/index.jsx`)
   - Category filter: All / For Sale / Services / Wanted / Deals
   - Search bar (client-side filter or API search)
   - Grid or list of approved listings (seller name, unit, price, type badge, save icon)
2. **Listing detail** (`/screens/marketplace-listings/index.jsx`)
   - Full image carousel (if images), title, price, description, seller info
   - "Save" button (heart icon) → `POST /v1/listings/{id}/save`
   - "Contact Seller" → show unit number + "Message" button (opens Chat)
3. **Create listing** (`/(tabs)/marketplace/create-deal.jsx`)
   - Type selector (For Sale / Service / Wanted / Deal)
   - Title, Price (optional for services/wanted), Description
   - Submit → `POST /v1/listings` → status `pending`
   - User sees their listing with "Pending Review" badge
4. **My Listings** (in profile or marketplace) → shows own listings with status badges
5. **Save toggle** → shows saved listings section (filtered `is_saved: true`)

### Admin Perspective
- Admin sees all listings in `/admin/marketplace` with status filter (Pending / Active / Rejected)
- Pending listings show an "Approve" and "Reject" button
- Approve → `PATCH /v1/admin/listings/{id}/approve` → notifies seller
- Reject → `PATCH /v1/admin/listings/{id}/reject` → notifies seller with rejection reason

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/listings` | Approved listings (residents) |
| POST | `/v1/listings` | Create listing |
| POST | `/v1/listings/{id}/save` | Save / unsave toggle |
| PATCH | `/v1/admin/listings/{id}/approve` | Admin approve |
| PATCH | `/v1/admin/listings/{id}/reject` | Admin reject |

### What Needs Building
- [ ] Wire `fetchListings()` in marketplace screens
- [ ] Listing card component (image, title, price, type badge, save button, seller unit)
- [ ] Listing detail screen with contact/message CTA
- [ ] Create listing form with type selector + price + description
- [ ] "My Listings" section (profile or dedicated tab)
- [ ] Saved listings section
- [ ] "Pending review" vs "Live" vs "Rejected" status badges on own listings

---

## Feature 6 — Amenity Bookings (Property)

### Real-Life Scenario
Carlos wants to book the swimming pool for Thursday. He opens the app → taps "Property" in navigation → sees a list of amenities: Pool, Gym, Community Hall, Rooftop Terrace, etc. Each has a status badge (Open / Bookable / Closed) and hours. He taps "Swimming Pool" → sees the booking calendar. He selects Thursday, picks the time slot "10:00 AM – 11:00 AM", enters 2 guests → taps "Book". He sees a confirmation: "Booking confirmed!" The booking appears under "My Bookings". If he changes his mind, he can cancel it from "My Bookings".

### User Journey
1. **Property home** (`/screens/property-management/index.jsx`)
   - List of amenities with status, hours, capacity
   - "My Bookings" button → dedicated bookings list
2. **Amenity detail** (`/screens/property-management/amenity/index.jsx`)
   - Name, description, capacity, hours, floor
   - "Book Now" button (only for `status: bookable`)
3. **Booking form** (`/screens/property-management/amenity/all-facilities/reservation-calender/index.jsx`)
   - Date picker (calendar)
   - Time slot selector (predefined slots)
   - Guest count stepper
   - Notes (optional)
   - Confirm → `POST /v1/bookings`
4. **My Bookings** (`/screens/property-management/my-booking/index.jsx`)
   - List of own bookings with amenity name, date, time, status badge
   - "Cancel" option → confirm dialog → `DELETE /v1/bookings/{id}`
5. **Conflict handling** — if slot already taken, API returns 422 → show "This time slot is already booked. Please choose another."

### Admin Perspective
- Admin sees all amenities in `/admin` or a future amenities management page
- Currently amenities are seeded — admin can update them via API (future enhancement: add/edit amenities in admin portal)
- Admin can view all bookings in a future bookings overview page

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/amenities` | List community amenities |
| GET | `/v1/bookings` | My bookings |
| POST | `/v1/bookings` | Create booking |
| DELETE | `/v1/bookings/{id}` | Cancel booking |

### What Needs Building
- [ ] Wire `fetchAmenities()` in property screens
- [ ] Amenity list with status badges and hours
- [ ] Amenity detail screen
- [ ] Booking calendar (date picker) + time slot selector
- [ ] Guest count stepper + notes field
- [ ] `POST /v1/bookings` with conflict error handling (422)
- [ ] My Bookings list with cancel option
- [ ] Confirmation modal on successful booking

---

## Feature 7 — Notifications

### Real-Life Scenario
Aisha is away from the app. The admin publishes an emergency notice: "Building evacuation drill at 11 AM." Aisha's phone buzzes with a push notification. She pulls down the notification → it opens the Havena app directly to the notice. Inside the app, there is also a notification bell icon (top-right of home screen) with a red badge showing "2". She taps it → sees a notification center with 2 unread items. She taps the first → it opens the notice. She taps "Mark all read" → the badge disappears.

### User Journey
1. **Notification bell** (top-right of home) with red badge = unread count
2. **Notification centre** (`/screens/notification/index.jsx`)
   - Full list of notifications, newest first
   - Unread items are highlighted (slightly different background)
   - Notification types: `info` (blue), `success` (green), `warning` (amber), `message` (purple), `system` (grey)
   - Tap notification → marks as read → navigates to relevant screen (if `action_url` set)
   - "Mark all read" button at top right
3. **Push notifications** (future — Expo Push or Firebase)
   - On app open, register device push token with backend
   - Backend sends push on notice publish, message received, booking confirmed, etc.

### Admin Perspective
- Admin can broadcast notifications to all residents by publishing a notice (auto-notifies all)
- Admin sees notification delivery in Activity Logs
- Admin can manually send notifications via a future "Broadcast" tool

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/notifications` | My notifications |
| POST | `/v1/notifications/{id}/read` | Mark single as read |
| POST | `/v1/notifications/read-all` | Mark all as read |

### What Needs Building
- [ ] Wire `fetchNotifications()` in `notification/index.jsx`
- [ ] Notification bell badge in home header (real unread count)
- [ ] Notification list with type-color coding and read/unread state
- [ ] Mark as read on tap + `POST /v1/notifications/{id}/read`
- [ ] "Mark all read" button + API call
- [ ] `action_url` navigation (if set, navigate to correct screen on tap)
- [ ] (Future) Push token registration with backend on app open

---

## Feature 8 — Profile & Settings

### Real-Life Scenario
Noah wants to update his profile. He taps the profile icon → sees his profile: display photo (initials placeholder), name "Noah Williams", unit "Apt 2D", bio. He taps "Edit" → inline form appears with name, phone, unit, and bio fields. He changes his bio → taps "Save". A success toast appears. He then taps "Change Photo" → device photo picker opens → he selects a photo → it uploads and the avatar updates. He also taps "Settings" → can toggle push notification preferences and change language (future).

### User Journey
1. **Profile screen** (`/screens/profile/index.jsx`)
   - Avatar (real image if uploaded, else initials gradient)
   - Name, unit, bio, member since date
   - Achievement badges (earned from activity)
   - "Edit Profile" button → inline form
   - "My Points" → leaderboard / points history
   - "Settings" → settings screen
   - "Sign Out" → confirm → logout + navigate to login
2. **Edit form** — name, phone (read-only or editable), unit number, bio
   - Save → `PUT /v1/me` → success toast
3. **Avatar upload** → `ImagePicker` → `POST /v1/me/avatar` (multipart) → update displayed avatar
4. **Settings screen** (`/screens/settings/index.jsx`)
   - Push notifications toggle
   - Dark mode toggle (future)
   - About / version info
   - Privacy policy link

### Admin Perspective
- Admin can view and edit any resident profile from `/admin/members/{id}` (web)
- Admin cannot access a specific resident's settings — those are personal

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/me` | Fetch my profile |
| PUT | `/v1/me` | Update name, bio, unit |
| POST | `/v1/me/avatar` | Upload avatar image |
| PUT | `/v1/me/password` | Change password (N/A for phone-auth users) |

### What Needs Building
- [ ] Wire `fetchMe()` on profile mount → populate all fields
- [ ] Edit form with `updateProfile()` → success/error toast
- [ ] Avatar display with real image vs initials fallback
- [ ] `ImagePicker` integration → `uploadAvatar()` → update state
- [ ] Achievement badges (computed from activity — e.g., "10 posts", "5 bookings")
- [ ] Settings screen with notification preference toggles (stored locally for now)
- [ ] Sign out → confirm → `logout()` → clear session → navigate to login

---

## Feature 9 — Wellness Hub

### Real-Life Scenario
Emily opens the Wellness tab. She sees 5 categories: Fitness, Mental Health, Nutrition, Sleep, Mindfulness. Each category shows a progress ring (e.g., "3/5 completed"). She taps "Mental Health" → sees a list of lessons. She picks "Guided Meditation for Stress" (15 min). She reads the description and taps "Mark Complete". The progress ring updates to 4/5. A small toast appears: "Great job! Lesson complete."

### User Journey
1. **Wellness home** (`/(tabs)/wellness/index.jsx`)
   - Category cards with progress rings or progress bars
   - Overall progress banner ("8 of 12 lessons completed")
2. **Category detail** (`/screens/wellness-detail.jsx` or inline tab)
   - List of lessons for that category
   - Each lesson: title, duration, description, completed/not-completed state
   - "Mark Complete" / "Undo" toggle button
3. **Lesson detail** (`/(tabs)/wellness/wellness-detail.jsx`)
   - Full description, duration, image (if any)
   - "Mark Complete" button → `POST /v1/wellness/{id}/complete`
   - If already complete → "Undo" button → `DELETE /v1/wellness/{id}/complete`

### Admin Perspective
- Admin does not manage wellness content from the web portal yet
- Wellness content is seeded (12 lessons across 5 categories)
- Future: Admin can add/edit wellness content from the portal

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/wellness` | All content grouped by category |
| POST | `/v1/wellness/{id}/complete` | Mark lesson complete |
| DELETE | `/v1/wellness/{id}/complete` | Undo completion |

### What Needs Building
- [ ] Wire `fetchWellness()` in wellness screens
- [ ] Category overview with progress bars/rings
- [ ] Lesson list per category
- [ ] "Mark Complete" / "Undo" toggle with `completeLesson()` / `uncompleteLesson()`
- [ ] Optimistic UI update (completion shows instantly before API responds)
- [ ] Overall progress stat (total completed / total)

---

## Feature 10 — Messaging (Chat)

### Real-Life Scenario
David wants to contact the admin about a noise complaint. He goes to Profile → "Message Admin". A conversation opens (or is created if first time). He types "Hi, there has been persistent loud music from Apt 7A every night past 11 PM." He sends it. The admin receives a push notification (web: notification bell in `/admin/messages`). The admin replies: "Thank you David, we'll look into it right away." David sees the reply in the conversation thread. Message timestamps show relative time ("2m ago").

### User Journey
1. **Conversations list** (accessible from Profile or a dedicated screen)
   - List of existing conversations with last message preview + unread badge
2. **Chat view** (single conversation)
   - Messages in a scrollable thread (mine on right, theirs on left)
   - Timestamp below messages
   - "Delivered" / "Read" status on sent messages (future)
3. **New conversation** → "+" button → search for user or select from community directory → `POST /v1/conversations`
4. **Send message** → text input + send button → `POST /v1/conversations/{id}/messages`
5. **Real-time** (future — Pusher) → messages appear without refresh

### Admin Perspective
- Admin sees all conversations at `/admin/messages`
- Admin can initiate a conversation with any resident
- Admin replies are sent from their admin account

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/conversations` | My conversation list |
| POST | `/v1/conversations` | Start new conversation |
| GET | `/v1/conversations/{id}/messages` | Thread messages |
| POST | `/v1/conversations/{id}/messages` | Send message |

### What Needs Building
- [ ] Conversations list screen (with last message + unread count)
- [ ] Chat view screen with message bubbles (mine right, theirs left)
- [ ] Send message form (keyboard-aware scroll view)
- [ ] New conversation → user picker (community member list)
- [ ] Wire all 4 API endpoints
- [ ] Poll for new messages every 5s (simple polling, pre-Pusher)

---

## Feature 11 — Report / Moderation

### Real-Life Scenario
Aisha receives an aggressive comment on her post. She long-presses the comment → "Report this" option appears. She taps it → a bottom sheet appears with report type options: Harassment, Spam, Threats, Inappropriate Content. She selects "Harassment" → adds a description "This user has been leaving hostile comments" → taps "Submit Report". She sees: "Report submitted. Our team will review it shortly."

On the admin side, the report appears in `/admin/moderation` with status "Open". The admin reviews it, reads the description, and clicks "Resolve". A notification is sent to Aisha: "Your report has been resolved."

### User Journey
1. Long-press on a post or comment → context menu → "Report"
2. Report bottom sheet: type selection (Harassment / Spam / Safety / Damage / Noise / Other)
3. Optional description text field
4. Submit → `POST /v1/reports` → success toast
5. Report status visible in profile under "My Reports" (future enhancement)

### Admin Perspective
- All reports appear at `/admin/moderation` sorted by severity and date
- Admin can filter by status (Open / In Review / Resolved / Escalated / Dismissed)
- Actions: Resolve (with note), Escalate, Dismiss
- Resolving sends a notification to the reporter

### Backend Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/v1/reports` | File a report |
| GET | `/v1/admin/reports` | Admin: all reports |
| PATCH | `/v1/admin/reports/{id}/resolve` | Admin: resolve |
| PATCH | `/v1/admin/reports/{id}/escalate` | Admin: escalate |
| PATCH | `/v1/admin/reports/{id}/dismiss` | Admin: dismiss |

### What Needs Building
- [ ] Long-press context menu on posts and comments (Report option)
- [ ] Report bottom sheet (type picker + description)
- [ ] `POST /v1/reports` with type, description, optional reported_user_id
- [ ] Success feedback toast

---

## Feature 12 — Community Join Flow (Onboarding)

### Real-Life Scenario
Ryan is a new resident. He downloads the app, enters his phone, receives OTP `123456`, logs in. Since he has no community membership yet, the app shows him the "Join Your Community" screen. He has two options: (1) Enter an invite code given by the admin, (2) Search for a community and request to join. He enters the invite code `SUNFLOWER-2026` and taps "Join". The app shows: "Request submitted! You'll be approved shortly." Once the admin approves him at `/admin/members`, Ryan gets a push notification and is redirected to the full Home screen.

### User Journey
1. Post-login check: `user.memberships` is empty or all memberships are `pending` → redirect to `/screens/invite-code`
2. **Invite Code screen:**
   - Text input for invite code
   - "Join Community" button → `POST /v1/communities/join-by-invite` → if approved instantly, go to Home; if pending, show waiting screen
3. **Community Search** (alternative):
   - Search bar → `GET /v1/communities/search?q=...`
   - Select community → "Request to Join" → `POST /v1/communities/{id}/join` → status `pending`
4. **Waiting screen:**
   - "Your request is pending admin approval" with illustration
   - Limited access: can view notices only, no posting/booking until approved
   - Refresh button to recheck status

### Admin Perspective
- Pending member appears in `/admin/members` with status `pending`
- Admin clicks "Approve" → `PATCH /v1/admin/members/{id}/approve` → resident gets push notification
- Admin clicks "Decline" → resident gets notification "Your request was not approved"

### What Needs Building
- [ ] Post-login routing logic (check memberships array)
- [ ] Invite code screen with `joinByInviteCode()` API call
- [ ] Community search + request to join
- [ ] Pending state screen with "refresh status" polling
- [ ] Success → redirect to full home

---

## Feature 13 — Leaderboard & Achievements

### Real-Life Scenario
Carlos has been very active: 15 feed posts, 3 bookings, 8 marketplace saves. He opens Profile → taps "My Points" → sees the leaderboard for the week. He's #3 in the community. His points breakdown: posts (30 pts), likes received (16 pts), bookings (9 pts), wellness completions (20 pts). He has earned 2 badges: "Community Voice" (10+ posts) and "Wellness Starter" (first lesson complete).

### User Journey
1. Profile → "My Points" → `GET /v1/leaderboard` (future endpoint)
2. Leaderboard screen (`/screens/leaderboard/index.jsx`):
   - Top 10 residents this week/month with avatar, name, points
   - My rank highlight
   - Points breakdown by category
3. Achievement badges shown on profile card
4. Points awarded automatically by backend when actions occur (post, like, booking, wellness)

### Admin Perspective
- No direct admin action for leaderboard
- Admin can reset points or award bonus points (future enhancement)

### Backend Endpoints (to be built)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/leaderboard` | Community leaderboard (points) |
| GET | `/v1/me/achievements` | My earned badges |

### What Needs Building
- [ ] `leaderboard` and `points` tables in the database
- [ ] Points awarded via `ActivityLogService` on each action
- [ ] Leaderboard endpoint + screen
- [ ] Achievement computation logic (thresholds → badges)
- [ ] Badges displayed on profile screen

---

## Development Order — Phase by Phase

### Phase 1 — Auth & Navigation (Days 1–2)
1. Fix OTP flow end-to-end with dummy phone accounts (DevOtpSeeder)
2. Root auth guard (token check → home or login)
3. Post-login routing (approved / pending / no membership)
4. Logout flow

### Phase 2 — Core Content (Days 3–4)
5. Home / Dashboard (live stats, latest notice, recent posts)
6. Notices list + detail (real API)
7. Notification centre (real API, badge on home)

### Phase 3 — Social (Days 5–6)
8. Community Feed (posts, likes, comments, create, delete)
9. Create Post screen (category + text + submit)

### Phase 4 — Marketplace (Day 7)
10. Marketplace listing grid (real API, category filter, search)
11. Create listing form
12. Save/unsave listing

### Phase 5 — Property & Wellness (Days 8–9)
13. Amenities list + detail
14. Booking calendar + confirm + cancel
15. Wellness categories + lesson complete toggle

### Phase 6 — Profile & Reports (Day 10)
16. Profile screen (real data, edit, avatar upload)
17. Settings screen
18. Report filing from feed context menu

### Phase 7 — Messaging (Days 11–12)
19. Conversations list + chat view
20. Send message + polling

### Phase 8 — Leaderboard & Onboarding Polish (Days 13–14)
21. Community join flow (invite code + search)
22. Leaderboard + achievements
23. Full test pass + bug fixes

---

## Dev Credentials Quick Reference

| Purpose | Phone | OTP | Notes |
|---|---|---|---|
| Primary test (approved) | `(555) 555-5555` | `123456` | Maps to Sarah Mitchell |
| Second resident | `(555) 555-0002` | `123456` | Maps to David Chen |
| Pending resident | `(555) 555-0009` | `123456` | Maps to Zara Ahmed (pending) |
| Suspended | `(555) 555-0011` | `123456` | Should be blocked on login |

> All phones must have corresponding entries in the `phone_otps` table or the OTP controller must map them to users by phone. The `DevOtpSeeder` must populate this.

---

## API Base URL Configuration

```
WAMP local: http://192.168.x.x/go-havena/backend/public/api/v1
```
Set `EXPO_PUBLIC_API_URL` in `.env` or rely on the auto-detection in `api-config.js` which reads the Metro bundler host IP.

---

## Notes & Constraints

- All actions that modify data must show a loading indicator while the API call is in progress
- All destructive actions (delete post, cancel booking, sign out) must show a native `Alert.alert` confirmation before proceeding
- Every API error must surface to the user via `Alert.alert` — never silently fail
- No emojis in any UI — use icons from `@expo/vector-icons` (Feather or MaterialIcons set)
- All list screens must implement pull-to-refresh (`RefreshControl`)
- All list screens must handle the empty state with an appropriate message and icon
- Offline handling: show a banner "You're offline" using `NetInfo` when no connection detected
- Images: use `expo-image` (already installed) for all image rendering — handles caching automatically
