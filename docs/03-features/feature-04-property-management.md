# Feature 4 — Property Management

**Friction Value · Priority P0 · Platforms: iOS, Android, Admin Dashboard · Dependencies: Auth, Community Membership**

## Purpose

Consolidate **rules, documents, amenity reservations, and resident utilities** so residents don't juggle multiple apps and systems.

## Sub‑modules

1. **Community Rules** — browsable rulebook.
2. **Documents** — categorized documents (PDFs) residents can view/download.
3. **Amenities / Facilities** — reservable resources (pool, BBQ, tennis, meeting room…).
4. **Reservations / My Bookings** — calendar‑based booking with capacity & rules.

## User stories

View rules; search rules; view document categories; view/download a document; browse amenities; view amenity detail + rules + capacity; pick a date/time on the reservation calendar; create a booking; view my bookings; cancel a booking; (admin) manage amenities, rules, documents, and approve/deny bookings.

## Data model

```text
CommunityRule
├── id / community_id / category / title / body / order

Document
├── id / community_id / category / title / file_url / size / uploaded_by / timestamps

Amenity
├── id / community_id / name / description / image_url
├── capacity: int
├── open_time / close_time
├── slot_minutes: int
└── rules: text

Reservation
├── id / amenity_id / user_id / community_id
├── starts_at / ends_at
├── party_size: int
├── status: enum(pending, confirmed, cancelled, rejected)
└── timestamps
```

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/communities/{cid}/rules` | List rules |
| GET | `/api/v1/communities/{cid}/documents` | List documents (`?category=`) |
| GET | `/api/v1/documents/{id}/download` | Signed download URL |
| GET | `/api/v1/communities/{cid}/amenities` | List amenities |
| GET | `/api/v1/amenities/{id}` | Amenity detail + rules |
| GET | `/api/v1/amenities/{id}/availability` | Available slots (`?date=`) |
| POST | `/api/v1/amenities/{id}/reservations` | Create reservation |
| GET | `/api/v1/me/reservations` | My bookings |
| DELETE | `/api/v1/reservations/{id}` | Cancel booking |

## Permission matrix

| Action | Resident | Moderator | Admin |
|--------|:--------:|:---------:|:-----:|
| View rules/documents/amenities | ✓ | ✓ | ✓ |
| Create / cancel own reservation | ✓ | ✓ | ✓ |
| Manage amenities/rules/documents | ✗ | ✗ | ✓ |
| Approve / reject reservations | ✗ | ✓* | ✓ |

\* if community enables moderator approval.

## Screens

Property hub → Amenities → All Facilities → Reservation Calendar → Rule details; Community Rules; Documents (categories + list); My Booking; booking confirmation.

## Acceptance criteria

- Booking respects amenity `capacity`, operating hours, and slot length; no double‑booking beyond capacity.
- Cancellation frees the slot immediately.
- Documents are served via signed URLs; non‑members get 403.
