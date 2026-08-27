# Google Play Store assets — Havena

Listing-only files. **Do not change in-app UI** to produce these.

| Field | Value |
|-------|--------|
| Name | Havena |
| Package | `com.zsquare.havena` |
| Version | `1.0.0` |
| Brand mark | Two-tone infinity (navy + teal) |
| Primary | `#1B4F8A` |
| Mid navy | `#163A66` |
| Canvas | `#F6F8FB` |

Regenerate icon + feature graphic (does not touch app screens):

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-play-store-assets.ps1
```

---

## Ready to upload (generated)

| File | Size | Format | Play Console field |
|------|------|--------|--------------------|
| `apps/mobile/store/play/ic_launcher_playstore_512.png` | **512 × 512** | PNG, opaque | Store listing → App icon (high-res) |
| `apps/mobile/store/play/feature_graphic_1024x500.png` | **1024 × 500** | PNG, opaque | Store listing → Feature graphic |
| `apps/mobile/store/play/app_icon_source_1024.png` | 1024 × 1024 | PNG | Reference only — do not upload |

Play icon rules used: 512×512, 32-bit PNG, **no transparency**, mark on `#1B4F8A` so it matches the Android adaptive icon users see on the home screen.

---

## You still capture: phone screenshots (required)

Play needs **at least 2** phone screenshots. Use **4–6**. Do **not** change the app to take them.

**Play rules:** JPEG or 24-bit PNG (no alpha), shortest side ≥ 320 px, longest side ≤ 3840 px. Recommended **1080 × 1920** (9:16 portrait).

| # | Screen | Route | Caption (≤80 chars) | Suggested filename |
|---|--------|-------|---------------------|--------------------|
| 1 | Home | `/(tabs)/home` | Stay connected to your community | `screenshot_01_home_1080x1920.png` |
| 2 | Community | `/(tabs)/community` | Notices, neighbors, and local life | `screenshot_02_community_1080x1920.png` |
| 3 | Marketplace | `/(tabs)/marketplace` | Buy, sell, and discover nearby | `screenshot_03_marketplace_1080x1920.png` |
| 4 | Services | `/(tabs)/services` | Book amenities and community services | `screenshot_04_services_1080x1920.png` |
| 5 | Profile | `/(tabs)/profile` | Your home profile in one place | `screenshot_05_profile_1080x1920.png` |
| 6 | Sign-in (optional) | `/screens/login` | Secure phone sign-in for residents | `screenshot_06_login_1080x1920.png` |

Save captures **in this folder**. How:

1. Open Expo Go or a preview/production build with real sample data (avoid empty states).
2. Use a phone or emulator at ~1080×1920. Hide the Expo debug banner if it appears.
3. Capture each screen above → copy into `apps/mobile/store/play/`.
4. Optional: add a device frame **outside** the app (Play Console or a mockup tool). Never change app code for framing.

Tablet 7" / 10" screenshots are optional.

---

## Runtime assets (not uploaded to Play listing)

These ship **inside the app**. They are already set. Do not swap them for listing files.

| Asset | Path | Size / notes | Play-ready? |
|-------|------|----------------|-------------|
| Expo icon | `apps/mobile/assets/images/app-icon.png` | 1024×1024, used by EAS/iOS | Yes for the binary |
| Adaptive foreground | `apps/mobile/assets/images/android-icon-foreground.png` | Infinity mark | Yes; `app.json` background `#1B4F8A` |
| Splash | `apps/mobile/assets/images/splash-icon.png` | Infinity, contain, **white** splash | Yes |
| Unused Expo defaults | `android-icon-background.png`, `android-icon-monochrome.png` | Not referenced in `app.json` | Ignore |

Splash in `app.json`: `splash-icon.png` on `#FFFFFF`. That is a product choice, not a Play listing asset.

---

## Validation

| Check | Status |
|-------|--------|
| Play high-res icon 512×512 PNG, no alpha | **Ready** — `ic_launcher_playstore_512.png` |
| Feature graphic 1024×500 | **Ready** — `feature_graphic_1024x500.png` |
| Phone screenshots ≥ 2 | **Missing** — capture into this folder |
| Short description ≤ 80 characters | **Missing** — write in Play Console |
| Full description | **Missing** — write in Play Console |
| Privacy policy URL | **Missing** — required for account/sign-in apps |
| Contact email | **Missing** — Play Console |
| Category | Suggest **Lifestyle** or **Social** |
| Production Android App Bundle (AAB) | Build with `eas build --platform android --profile production` |
| Play App Signing / EAS Android submit | `eas.json` `submit.production` is **iOS only** today |

Suggested short description (78 chars):

`Havena — community notices, marketplace, amenities, and neighbor connection.`

---

## What you upload where

**Play Console → Main store listing**

1. App icon → `ic_launcher_playstore_512.png`
2. Feature graphic → `feature_graphic_1024x500.png`
3. Phone screenshots → the 4–6 files you capture
4. Title: `Havena`

**Play Console → App (binary)**

- Production AAB from EAS (uses `app-icon.png` + adaptive icon inside the build — already configured)

Do not upload `app_icon_source_1024.png` or in-app `assets/images/*` as listing screenshots.
