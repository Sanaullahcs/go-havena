# Havena store submission

Use these values in **App Store Connect** and **Google Play Console**. Do not invent different demo emails.

| Field | Value |
|-------|--------|
| App name | Havena |
| Package / bundle | `com.zsquare.havena` |
| Version | `1.0.0` |
| Support email | `hello@gohavena.com` |
| Privacy policy | https://gohavena.com/privacy-policy |
| Terms | https://gohavena.com/terms-and-conditions |
| Marketing site | https://gohavena.com |
| Category | Lifestyle (secondary: Social) |

## Reviewer login (both stores)

Do **not** delete these accounts during review.

| Role | Email | OTP |
|------|--------|-----|
| Resident | `test.resident@havena.app` | `123456` |
| Community admin | `test.community.admin@havena.app` | `123456` |

Notes for reviewers:

- Sign in with email + OTP. No password. On Sign In, enter the email, tap **Send Code**, then enter `123456`.
- After OTP, the resident opens Home. The community admin can also complete web dashboard login and open `/admin`.
- Account deletion lives in **Profile → Settings → Delete Account**. Please use a newly created email if you need to test deletion.

## App Store Connect

**Subtitle (30):** Community life, in one app

**Promotional text:** Stay current with notices, neighbors, amenities, and the resident marketplace.

**Description:**

Havena is the private community app for HOAs and neighborhoods. Residents get notices, events, a neighbor feed, marketplace listings, amenity booking, and messages — scoped to their community.

Community admins can publish notices, review members, manage amenities, and keep the neighborhood running from the same app.

Havena is invite- or approval-based. It is not a public social network.

**Keywords (100):** community,HOA,neighbors,notices,amenities,marketplace,residents,apartment,neighborhood

**Support URL:** https://gohavena.com

**Marketing URL:** https://gohavena.com

**Age rating:** 13+ (Infrequent/Mild user-generated content; no unrestricted web; no alcohol/gambling/horror)

**Export compliance:** Uses only HTTPS / standard encryption. `ITSAppUsesNonExemptEncryption` is false.

**App Privacy (nutrition labels):**

- Collected: name, email, phone, photos (user-provided), user content (posts, messages, listings)
- Not collected from the device: precise location, contacts, financial info, advertising data
- Linked to identity: account info and user content
- Used for: app functionality, account management
- Not used for tracking. No third-party advertising.

**Review notes (paste):**

```
Havena is a private community app. Sign in with email OTP (no password).

1. On Sign In, enter the email and tap Send Code.
2. Enter the 6-digit OTP.

Resident: test.resident@havena.app
Community admin: test.community.admin@havena.app
OTP: 123456

These accounts were verified on production. After login the resident opens Home. The community admin can also complete dashboard login and open /admin.

Privacy policy: https://gohavena.com/privacy-policy
Account deletion: Profile → Settings → Delete Account
Please do not delete the demo accounts above.

Camera is used for invite QR codes and optional photos. Notifications are optional. Face ID is optional sign-in.
```

**iOS screenshots:** `apps/mobile/store/ios/` (6.7" 1290×2796). Upload at least 3.

## Google Play Console

**Short description (80):** Havena — community notices, marketplace, amenities, and neighbor connection.

**Full description:**

Havena helps HOAs and neighborhoods run daily community life in one private app.

• Notices, events, and alerts from management
• Neighbor feed and messages
• Resident marketplace and local deals
• Amenity booking
• Community admin tools for approved managers

Sign in with your email and a one-time code. Access is limited to your community.

Privacy policy: https://gohavena.com/privacy-policy
Support: hello@gohavena.com

**Listing assets:**

- Icon: `store/play/ic_launcher_playstore_512.png`
- Feature graphic: `store/play/feature_graphic_1024x500.png`
- Phone screenshots: `store/play/01_Home.png` … `08_Profile.png`

**Data safety:**

| Data | Collected | Shared | Required | Purpose |
|------|-----------|--------|----------|---------|
| Name | Yes | No (community-only) | Yes | App functionality |
| Email | Yes | No | Yes | Account sign-in |
| Phone | Yes | No | Optional | Account / contact |
| Photos | Yes | No (community-only) | Optional | Profile / posts |
| User content | Yes | No (community-only) | Optional | Feed, messages, listings |
| Approximate location | No | — | — | — |
| Precise location | No | — | — | — |

Encryption in transit: Yes. Users can request deletion in-app. Account creation: Yes.

**Content rating:** questionnaire as a social / lifestyle utility; user-generated content; 13+.

**Target audience:** 13+

**News app / COVID / COVID:** No.

**Play App Signing:** upload the production AAB from `eas build --platform android --profile production`. Signing uses the local Havena keystore (`credentials.json`).

Android submit from EAS still needs a Play Console service account JSON. Until that file is added, upload the AAB in Play Console → Production (or Internal testing first).

## Build commands

From `apps/mobile`:

```
npx eas build --platform ios --profile production --non-interactive
npx eas build --platform android --profile production --non-interactive
npx eas submit --platform ios --profile production --latest --non-interactive
```
