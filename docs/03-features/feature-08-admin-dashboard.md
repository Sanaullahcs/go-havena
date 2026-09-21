# Admin Dashboard (Operational Backbone)

**Priority P0 · Platform: Next.js web · Dependencies: all features**

The Admin Dashboard provides complete control over communities, residents, content moderation, engagement analytics, marketplace, and communications. (Full UX detail in [07-dashboards/frontend.md](../07-dashboards/frontend.md).)

## Module capabilities

| Module | Capabilities |
|--------|--------------|
| **Community Management** | Approve/reject members, create invite codes, manage moderators, community settings |
| **Content Moderation** | Review queue, AI flags, reports, abuse handling, hide/remove/restore, warn/ban |
| **Notice Board Control** | Publish announcements, events, alerts, reminders; pin/archive |
| **Marketplace Tools** | Business listings, coupons/offers, reviews moderation, approve listings |
| **Analytics** | Engagement tracking, retention metrics, growth insights |
| **Property Tools** | Manage amenities, rules, documents; approve/deny reservations |
| **Gamification Engine** | Configure rewards, badges, leaderboards, earning rules |

## Key admin endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/communities/{cid}/members?status=pending` | Pending members |
| POST | `/api/v1/admin/communities/{cid}/members/{uid}/approve` | Approve member |
| POST | `/api/v1/admin/communities/{cid}/members/{uid}/reject` | Reject member |
| POST | `/api/v1/admin/communities/{cid}/members/{uid}/ban` | Ban member |
| POST | `/api/v1/admin/communities/{cid}/invite-codes` | Create invite code |
| POST | `/api/v1/admin/communities/{cid}/members/{uid}/role` | Set role (moderator/admin) |
| GET | `/api/v1/admin/communities/{cid}/moderation/queue` | Moderation queue |
| POST | `/api/v1/admin/moderation/{type}/{id}/action` | Take moderation action |
| GET | `/api/v1/admin/communities/{cid}/analytics` | Engagement/retention/growth metrics |
| POST | `/api/v1/admin/communities/{cid}/gamification/rules` | Update earning rules |

## Permission matrix (admin surface)

| Action | Moderator | Admin |
|--------|:---------:|:-----:|
| Access moderation queue | ✓ | ✓ |
| Take content actions | ✓ | ✓ |
| Approve/reject/ban members | ✗ | ✓ |
| Create invite codes / set roles | ✗ | ✓ |
| Manage marketplace, property, gamification config | ✗ | ✓ |
| View analytics | ✓ (read) | ✓ |

## Acceptance criteria

- Every destructive action (ban, remove, reject) is audit‑logged with actor, target, reason, timestamp.
- Admin actions are scoped to communities the admin operates.
- Analytics reflect DAU/WAU/MAU, retention cohorts, posts/notices volume, marketplace redemptions.
