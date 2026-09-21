# Mobile App (React Native / Expo)

The residents' primary client. Built with **Expo SDK 56** and **expo-router** at `apps/mobile/`.

> ⚠️ Per repo `AGENTS.md`: **Expo has changed.** Read the versioned docs at <https://docs.expo.dev/versions/v56.0.0/> before writing or upgrading any native/Expo API.

## Project structure

```text
app/                         # expo-router routes (file-based)
├── index.js                 # entry / splash
├── _layout.jsx              # root stack (registers all screens)
├── (tabs)/                  # bottom tab group
│   ├── _layout.jsx          # tab bar: Feed, Notices, Create(FAB), Wellness, Marketplace
│   ├── home.jsx
│   ├── notices.jsx
│   ├── create-post.jsx
│   ├── wellness/            # index, lessons, lessonVedio, wellness-detail
│   └── marketplace/         # listings, deals, coupons, redeem, manage, etc.
└── screens/                 # stack screens (auth, profile, property, etc.)
    ├── login/, signup/, verifyregistration/, complete-profile/
    ├── roles/, region/, invite-code/, request-for-community/
    ├── create-notice/, create-event/, create-alert/, create-post/, event-detail/
    ├── property-management/ # amenity, documents, community-rules, my-booking
    ├── achievements/, leaderboard/, profile/(points-history), notification/, settings/
components/                  # UI + feature widgets (home/, new-home/, ui/, profile/, biometric/)
constants/                   # font.js, role-session.js
hooks/                       # use-color-scheme
assets/                      # images, svgs, lottie
```

## Conventions

- **Routing:** file‑based via `expo-router`; register stack screens in `app/_layout.jsx`.
- **Styling:** `StyleSheet` + tokens from `constants/font.js`. Match Figma exactly.
- **Images/icons:** `expo-image`; tab icons tinted by focus state.
- **Role:** `constants/role-session.js` holds `resident | admin`, passed via nav params.
- **Biometric:** `expo-local-authentication` unlocks a stored token.
- **Media:** wellness video via `expo-av`; image pick via `expo-image-picker`.

## API integration (to build)

- Add a typed API client (`lib/api`) targeting `EXPO_PUBLIC_API_BASE_URL`.
- Store Sanctum token in `expo-secure-store`; attach `Authorization` + `X-Community-Id`.
- Use TanStack Query (recommended) for caching/refetch; subscribe to realtime channels for feed/notices.

## Build & run

```bash
cd apps/mobile
npm install
npx expo start          # then press a (Android), i (iOS), or w (web)
```

From repo root: `npm run install:mobile` then `npm run mobile`.

Scripts: `npm run android`, `npm run ios`, `npm run web`, `npm run lint`.

## Mapping to design & specs

- Screens ↔ Figma: [02-design-system/screen-inventory.md](../02-design-system/screen-inventory.md).
- Navigation: [02-design-system/navigation-map.md](../02-design-system/navigation-map.md).
- Each feature's behavior: [03-features](../03-features/).
