# Feature 2 — Digital Notice Board

**Local Value · Priority P0 (Critical) · Platforms: iOS, Android, Admin Dashboard · Dependencies: Auth, Community Membership**

## Purpose

The community's **single source of truth** for events, updates, announcements, and neighborhood information.

## Notice types

| Type | Who can post |
|------|--------------|
| 📢 Announcement | Admin only |
| 📅 Event | All residents |
| 📝 Update | All residents |
| ⚠️ Alert | Admin only |
| 🔔 Reminder | Moderator+ |
| 🏠 Neighbor Post | All residents |

## User stories (14)

- US‑2.1: View notice board.
- US‑2.2 – US‑2.14: Filter by type; view notice detail; RSVP to event; add event to calendar; create/edit/delete (per permissions); pin/unpin (admin); receive push on new announcement/alert; comment on a notice; report a notice; search notices; see "Happening Soon"; mark reminder done; share a notice.

## Data model

```text
Notice
├── id (PK)
├── community_id (FK)
├── author_id (FK → User)
├── type: enum(announcement, event, update, alert, reminder, neighbor_post)
├── title: string
├── body: text
├── starts_at / ends_at: timestamp (nullable, events)
├── location: string (nullable)
├── is_pinned: boolean
├── status: enum(published, draft, archived)
└── timestamps

EventRsvp (for type=event)
├── id (PK)
├── notice_id (FK)
├── user_id (FK)
└── status: enum(going, maybe, not_going)
```

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/communities/{cid}/notices` | List notices (filter `?type=`, `?upcoming=1`) |
| POST | `/api/v1/communities/{cid}/notices` | Create notice (type‑gated) |
| GET | `/api/v1/notices/{id}` | Notice detail |
| PUT | `/api/v1/notices/{id}` | Update (author/admin) |
| DELETE | `/api/v1/notices/{id}` | Delete (author/admin) |
| POST | `/api/v1/notices/{id}/pin` | Pin/unpin (admin) |
| POST | `/api/v1/notices/{id}/rsvp` | RSVP to an event |
| POST | `/api/v1/notices/{id}/report` | Report a notice |

## Permission matrix

| Action | Resident | Moderator | Admin |
|--------|:--------:|:---------:|:-----:|
| View notices | ✓ | ✓ | ✓ |
| Post Event / Update / Neighbor Post | ✓ | ✓ | ✓ |
| Post Reminder | ✗ | ✓ | ✓ |
| Post Announcement / Alert | ✗ | ✗ | ✓ |
| Pin / archive any notice | ✗ | ✗ | ✓ |
| RSVP to event | ✓ | ✓ | ✓ |

## Screens

Noticeboard list, Create Notice / Create Notice – Filled, Create Event, Create Alert, Event Details, Add a new post. Home shows a "Happening Soon" widget (`components/home/happeningSoon.jsx`).

## Acceptance criteria

- Posting an Announcement/Alert is blocked for non‑admins (server‑enforced).
- New Announcement/Alert triggers a queued push to all community members.
- Events surface in "Happening Soon" by `starts_at`; RSVPs are per user, idempotent.
- Pinned notices sort to the top of the board.
