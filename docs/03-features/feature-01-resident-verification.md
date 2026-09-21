# Feature 1 — Secure Resident Verification

**Foundation feature · Priority P0 (Critical) · Platforms: iOS, Android, Admin Dashboard · Dependencies: none**

## Purpose

Verify that users are **actual residents** of the neighborhood before granting access to the community. This is the safety foundation the whole platform stands on.

## User stories (14)

| ID | Story |
|----|-------|
| US‑1.1 | Sign up with email |
| US‑1.2 | Sign up with phone (SMS OTP) |
| US‑1.3 | Sign up with Google OAuth |
| US‑1.4 | Sign up with Apple ID |
| US‑1.5 | Login with existing account |
| US‑1.6 | Biometric login (Face ID / Touch ID) |
| US‑1.7 | Password reset |
| US‑1.8 | Find and join a community |
| US‑1.9 | Join community via invite code |
| US‑1.10 | Request to join a community |
| US‑1.11 | Create profile |
| US‑1.12 | Edit profile |
| US‑1.13 | Logout |
| US‑1.14 | Delete account |

## Data model

```text
User
├── id: BIGINT (PK)              # UUIDs surfaced externally
├── email: string (unique, nullable)
├── email_verified_at: timestamp (nullable)
├── phone: string (unique, nullable)
├── phone_verified_at: timestamp (nullable)
├── password: string (hashed, nullable)
├── google_id: string (nullable)
├── apple_id: string (nullable)
├── status: enum(active, suspended, deleted)
└── 1:1 Profile

Profile
├── id (PK)
├── user_id (FK)
├── display_name: string (2–50)
├── avatar_url: string (nullable)
├── bio: string (max 500, nullable)
└── unit_number: string (nullable)

CommunityMembership
├── id (PK)
├── user_id (FK)
├── community_id (FK)
├── role: enum(member, moderator, admin)
├── status: enum(pending, approved, rejected, banned)
└── invite_code_used: string (nullable)
```

See full schema in [04-data-model/database-schema.md](../04-data-model/database-schema.md).

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register/email` | Register with email/password |
| POST | `/api/v1/auth/register/phone` | Register with phone number |
| POST | `/api/v1/auth/register/google` | Register/login with Google |
| POST | `/api/v1/auth/register/apple` | Register/login with Apple |
| POST | `/api/v1/auth/login` | Login with email/password |
| POST | `/api/v1/auth/otp/request` | Send SMS OTP |
| POST | `/api/v1/auth/otp/verify` | Verify SMS OTP |
| POST | `/api/v1/auth/verify-email` | Verify email with token |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password with token |
| POST | `/api/v1/auth/logout` | Revoke current token |
| GET  | `/api/v1/me` | Get current user + profile |
| PUT  | `/api/v1/me` | Update current profile |
| DELETE | `/api/v1/me` | Delete account (soft) |
| GET  | `/api/v1/communities/search` | Search communities |
| POST | `/api/v1/communities/{id}/join` | Request to join / join with invite code |

> Biometric login is **device‑side** (`expo-local-authentication`): it unlocks a stored Sanctum token; it is not a server endpoint.

## Permission matrix

| Action | Resident | Moderator | Admin |
|--------|:--------:|:---------:|:-----:|
| View public community info | ✓ | ✓ | ✓ |
| Request to join community | ✓ | ✓ | ✓ |
| Create invite codes | ✗ | ✗ | ✓ |
| Approve / reject members | ✗ | ✗ | ✓ |
| Ban members | ✗ | ✗ | ✓ |

## Screens (Figma → app)

Splash → Welcome back / Sign up with Phone → OTP → Verify → Select Role (Admin/Resident) → Select Region → Enter Invite Code / Request to Add Community → Complete Profile. Biometric: Face ID / Touch ID / Verification successful.

## Acceptance criteria

- A user cannot access community content until membership `status = approved`.
- Phone signup requires a verified OTP before account creation completes.
- Guest browsing exposes **only** public community info (name, region, description), never resident data.
- Account deletion soft‑deletes and anonymizes PII within retention policy.
- Invite codes are single‑community, optionally usage‑limited and expiring.
