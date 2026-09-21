# Navigation Map (Mobile)

The mobile app uses **expo-router** file‑based routing. Auth/onboarding screens live under `app/screens/*`; the main app lives in the `(tabs)` group.

## Top‑level flow

```mermaid
flowchart TD
    Splash["Splash (app/index)"] --> Auth{Authenticated?}
    Auth -- No --> Welcome["Welcome back / Sign up"]
    Welcome --> Method{"Auth method"}
    Method -->|Phone| OTP["OTP verify"]
    Method -->|Email| EmailVerify["Verify email"]
    Method -->|Google/Apple| OAuth["OAuth"]
    OTP & EmailVerify & OAuth --> Role["Select role: Admin / Resident"]
    Role --> Region["Select Region"]
    Region --> Join{"Join community"}
    Join -->|Invite code| Invite["Enter Invite Code"]
    Join -->|Search| Request["Request to Add Community"]
    Invite & Request --> Profile["Complete Profile"]
    Profile --> Tabs

    Auth -- Yes --> Biometric["Biometric unlock (Face/Touch ID)"]
    Biometric --> Tabs

    Tabs["(tabs) — main app"]
```

## Tab bar

```mermaid
flowchart LR
    Feed["🏠 Feed / Home"]
    Notices["📢 Notices"]
    Create["➕ Create (FAB → modal)"]
    Wellness["🧘 Wellness"]
    Market["🛒 Marketplace"]
```

The center **Create** button opens `CreateNewModal` rather than navigating, offering: New Post, Notice, Event, Alert (role‑gated).

## Home widget stack → destinations

From `app/(tabs)/home.jsx`, the home scroll stacks widgets, each linking to its feature:

```mermaid
flowchart TD
    Home --> N["Notices → Notice Board"]
    Home --> C["Communities → community switch"]
    Home --> D["Deal Corner → Marketplace deals"]
    Home --> W["Wellness → Resource Hub"]
    Home --> P["Property Management → Amenities/Docs"]
    Home -.FAB.-> Quick["Quick tabs: Home, Market, Property, Create, Wellness, Notice"]
```

## Stack routes (registered in `app/_layout.jsx`)

Auth/onboarding: `roles`, `invite-code`, `request-for-community`, `region`, `signup`, `verifyregistration`, `find-community`, `complete-profile`, `login`, `login/verify-phone`.

Content: `create-notice`, `create-event`, `create-alert`, `create-post`, `event-detail`, `notification`.

Profile/gamification: `profile`, `profile/points-history`, `achievements`, `leaderboard`, `settings`.

Marketplace: `marketplace-listings` (+ `(tabs)/marketplace/*`).

Property: `property-management`, `property-management/amenity[/all-facilities[/reservation-calender[/rule-details]]]`, `property-management/community-rules`, `property-management/documents`, `property-management/my-booking`.

## Role‑aware UI

Role is held in `constants/role-session.js` (`resident` | `admin`) and passed through navigation params (`role`). Admin‑only actions (create announcement, create alert, manage marketplace, approve members) are gated on `admin`/`moderator`. See each feature's permission matrix in [03-features](../03-features/).
