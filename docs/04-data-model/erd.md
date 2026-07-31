# Entity Relationship Diagram

All content entities are scoped to a **Community**. A User joins one or more Communities via **CommunityMembership** (which carries the role).

```mermaid
erDiagram
    USERS ||--|| PROFILES : has
    USERS ||--o{ COMMUNITY_MEMBERSHIPS : joins
    COMMUNITIES ||--o{ COMMUNITY_MEMBERSHIPS : contains
    COMMUNITIES ||--o{ INVITE_CODES : issues

    COMMUNITIES ||--o{ NOTICES : has
    USERS ||--o{ NOTICES : authors
    NOTICES ||--o{ EVENT_RSVPS : has

    COMMUNITIES ||--o{ POSTS : has
    USERS ||--o{ POSTS : authors
    POSTS ||--o{ COMMENTS : has
    POSTS ||--o{ REACTIONS : has
    USERS ||--o{ REPORTS : files

    COMMUNITIES ||--o{ RESOURCE_CATEGORIES : has
    RESOURCE_CATEGORIES ||--o{ COURSES : groups
    COURSES ||--o{ LESSONS : contains
    USERS ||--o{ LESSON_PROGRESS : tracks
    LESSONS ||--o{ LESSON_PROGRESS : measured_by

    COMMUNITIES ||--o{ AMENITIES : has
    AMENITIES ||--o{ RESERVATIONS : booked_as
    USERS ||--o{ RESERVATIONS : makes
    COMMUNITIES ||--o{ COMMUNITY_RULES : has
    COMMUNITIES ||--o{ DOCUMENTS : has

    COMMUNITIES ||--o{ BUSINESSES : has
    BUSINESSES ||--o{ DEALS : offers
    DEALS ||--o{ REDEMPTIONS : redeemed_as
    USERS ||--o{ REDEMPTIONS : redeems
    BUSINESSES ||--o{ REVIEWS : reviewed_by
    COMMUNITIES ||--o{ LISTINGS : has

    USERS ||--o{ POINTS_LEDGER : earns
    USERS ||--o{ USER_BADGES : unlocks
    BADGES ||--o{ USER_BADGES : awarded_as
    USERS ||--o{ STREAKS : maintains

    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ DEVICES : registers
```

## Conventions

- Surrogate PK `id` (`BIGINT UNSIGNED AUTO_INCREMENT`). A public `uuid`/`ulid` column is exposed in API responses where opacity is desired.
- Timestamps `created_at` / `updated_at` on every table; `deleted_at` where soft deletes apply (users, posts, listings).
- Foreign keys are indexed; `community_id` is indexed on every scoped table.
- Enums use MySQL `ENUM` or a string column with an app‑level cast (Laravel enum casts).
- Money stored as `DECIMAL(10,2)`; never floats.

## Tenancy & integrity rules

- A user must have an `approved` `CommunityMembership` to read/write community content.
- Deleting a community cascades (soft) to its content; users persist (they may belong to other communities).
- Polymorphic `reports` and `points_ledger.source` reference content via `*_type` + `*_id`.
