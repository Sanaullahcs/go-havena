# Database Schema (MySQL 8)

> Reference schema for Laravel 11 migrations. Column types are MySQL; Laravel migration equivalents in parentheses where helpful. All tables include `created_at`, `updated_at` unless stated. Engine: InnoDB, charset `utf8mb4`.

## Identity & community

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT UNSIGNED PK | |
| uuid | CHAR(26) UNIQUE | public id (ULID) |
| email | VARCHAR(255) UNIQUE NULL | |
| email_verified_at | TIMESTAMP NULL | |
| phone | VARCHAR(20) UNIQUE NULL | |
| phone_verified_at | TIMESTAMP NULL | |
| password | VARCHAR(255) NULL | hashed |
| google_id | VARCHAR(255) NULL | |
| apple_id | VARCHAR(255) NULL | |
| status | ENUM('active','suspended','deleted') DEFAULT 'active' | |
| deleted_at | TIMESTAMP NULL | soft delete |

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| user_id | BIGINT FK→users UNIQUE | |
| display_name | VARCHAR(50) | 2–50 chars |
| avatar_url | VARCHAR(512) NULL | |
| bio | VARCHAR(500) NULL | |
| unit_number | VARCHAR(50) NULL | |

### `communities`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| name | VARCHAR(150) | e.g. "Oak Valley" |
| region | VARCHAR(150) | e.g. "Austin TX" |
| description | TEXT NULL | |
| timezone | VARCHAR(64) | |
| settings | JSON NULL | moderation/gamification toggles |
| status | ENUM('active','inactive') DEFAULT 'active' | |

### `community_memberships`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| user_id | BIGINT FK→users | |
| community_id | BIGINT FK→communities | |
| role | ENUM('member','moderator','admin') DEFAULT 'member' | |
| status | ENUM('pending','approved','rejected','banned') DEFAULT 'pending' | |
| invite_code_used | VARCHAR(64) NULL | |
| | UNIQUE(user_id, community_id) | |

### `invite_codes`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| community_id | BIGINT FK | |
| code | VARCHAR(64) UNIQUE | |
| created_by | BIGINT FK→users | admin |
| max_uses | INT NULL | |
| used_count | INT DEFAULT 0 | |
| expires_at | TIMESTAMP NULL | |

## Notice board

### `notices`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| community_id | BIGINT FK | indexed |
| author_id | BIGINT FK→users | |
| type | ENUM('announcement','event','update','alert','reminder','neighbor_post') | |
| title | VARCHAR(200) | |
| body | TEXT | |
| starts_at / ends_at | TIMESTAMP NULL | events |
| location | VARCHAR(200) NULL | |
| is_pinned | BOOLEAN DEFAULT 0 | |
| status | ENUM('published','draft','archived') DEFAULT 'published' | |

### `event_rsvps`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| notice_id | BIGINT FK | |
| user_id | BIGINT FK | |
| status | ENUM('going','maybe','not_going') | |
| | UNIQUE(notice_id, user_id) | |

## Community feed

### `posts`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| community_id | BIGINT FK | indexed |
| author_id | BIGINT FK | |
| body | TEXT | |
| media | JSON NULL | image URLs |
| topic | VARCHAR(100) NULL | indexed |
| like_count / comment_count | INT DEFAULT 0 | denormalized |
| moderation_status | ENUM('pending','approved','flagged','removed') DEFAULT 'pending' | |
| deleted_at | TIMESTAMP NULL | |

### `comments`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| post_id | BIGINT FK | |
| author_id | BIGINT FK | |
| parent_id | BIGINT FK→comments NULL | threaded replies |
| body | TEXT | |
| moderation_status | ENUM(...) DEFAULT 'pending' | |

### `reactions`
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| post_id | BIGINT FK | |
| user_id | BIGINT FK | |
| type | ENUM('like') DEFAULT 'like' | extensible |
| | UNIQUE(post_id, user_id, type) | |

### `reports` (polymorphic)
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| reportable_type | VARCHAR(64) | Post/Comment/Listing/Business |
| reportable_id | BIGINT | |
| reporter_id | BIGINT FK→users | |
| reason | ENUM('spam','harassment','discrimination','political','religious','other') | |
| status | ENUM('open','reviewing','actioned','dismissed') DEFAULT 'open' | |

## Resource hub

```text
resource_categories
  id BIGINT PK
  key ENUM('weight','exercise','stress','learning','social')
  title VARCHAR(150) · description TEXT NULL · icon VARCHAR(255) NULL

courses
  id BIGINT PK
  category_id BIGINT FK→resource_categories
  title VARCHAR(200) · summary TEXT NULL · cover_url VARCHAR(512) NULL
  is_hsa_eligible BOOLEAN DEFAULT 0
  status ENUM('published','draft') DEFAULT 'draft'

lessons
  id BIGINT PK
  course_id BIGINT FK→courses
  title VARCHAR(200)
  content_type ENUM('video','article')
  media_url VARCHAR(512) NULL · body TEXT NULL
  duration_seconds INT NULL · order INT DEFAULT 0

lesson_progress
  id BIGINT PK
  user_id BIGINT FK→users · lesson_id BIGINT FK→lessons
  status ENUM('in_progress','completed')
  progress_percent TINYINT (0–100) · completed_at TIMESTAMP NULL
  UNIQUE(user_id, lesson_id)
```

## Property management

```text
community_rules
  id BIGINT PK · community_id BIGINT FK
  category VARCHAR(100) · title VARCHAR(200) · body TEXT · order INT DEFAULT 0

documents
  id BIGINT PK · community_id BIGINT FK
  category VARCHAR(100) · title VARCHAR(200)
  file_url VARCHAR(512) · size_bytes BIGINT NULL · uploaded_by BIGINT FK→users

amenities
  id BIGINT PK · community_id BIGINT FK
  name VARCHAR(150) · description TEXT NULL · image_url VARCHAR(512) NULL
  capacity INT · open_time TIME · close_time TIME · slot_minutes INT · rules TEXT NULL

reservations
  id BIGINT PK
  amenity_id BIGINT FK · user_id BIGINT FK · community_id BIGINT FK
  starts_at DATETIME · ends_at DATETIME · party_size INT DEFAULT 1
  status ENUM('pending','confirmed','cancelled','rejected') DEFAULT 'pending'
  INDEX(amenity_id, starts_at)   -- guards against overbooking
```

## Marketplace

```text
businesses
  id BIGINT PK · community_id BIGINT FK · owner_id BIGINT FK→users NULL
  name VARCHAR(150) · category VARCHAR(100) · description TEXT NULL
  logo_url VARCHAR(512) NULL · images JSON NULL
  address VARCHAR(255) NULL · phone VARCHAR(40) NULL · website VARCHAR(255) NULL
  rating_avg DECIMAL(3,2) DEFAULT 0 · rating_count INT DEFAULT 0
  status ENUM('active','pending','hidden') DEFAULT 'pending'

deals
  id BIGINT PK · business_id BIGINT FK · community_id BIGINT FK
  title VARCHAR(200) · description TEXT NULL · image_url VARCHAR(512) NULL
  discount_type ENUM('percent','amount','bogo','other')
  discount_value DECIMAL(10,2) NULL · code VARCHAR(64) NULL
  starts_at DATETIME · ends_at DATETIME · redemption_limit INT NULL
  status ENUM('active','expired','paused') DEFAULT 'active'

redemptions
  id BIGINT PK · deal_id BIGINT FK · user_id BIGINT FK
  code VARCHAR(64) · redeemed_at TIMESTAMP NULL
  status ENUM('saved','redeemed','expired') DEFAULT 'saved'
  UNIQUE(deal_id, user_id)

reviews
  id BIGINT PK · business_id BIGINT FK · author_id BIGINT FK→users
  rating TINYINT (1–5) · body TEXT NULL

listings
  id BIGINT PK · community_id BIGINT FK · seller_id BIGINT FK→users
  type ENUM('item','service') · title VARCHAR(200) · description TEXT NULL
  price DECIMAL(10,2) NULL · images JSON NULL
  status ENUM('active','sold','removed') DEFAULT 'active' · deleted_at TIMESTAMP NULL
```

## Gamification

```text
points_ledger
  id BIGINT PK · user_id BIGINT FK · community_id BIGINT FK
  event_type VARCHAR(64) · points INT
  source_type VARCHAR(64) NULL · source_id BIGINT NULL · created_at TIMESTAMP
  UNIQUE(user_id, source_type, source_id, event_type)   -- idempotency

badges
  id BIGINT PK · key VARCHAR(64) UNIQUE
  title VARCHAR(150) · description TEXT NULL · icon_url VARCHAR(512) NULL · criteria JSON

user_badges
  id BIGINT PK · user_id BIGINT FK · badge_id BIGINT FK · awarded_at TIMESTAMP
  UNIQUE(user_id, badge_id)

streaks
  id BIGINT PK · user_id BIGINT FK · community_id BIGINT FK
  current_count INT DEFAULT 0 · longest_count INT DEFAULT 0 · last_active_on DATE
  UNIQUE(user_id, community_id)
```

## Notifications & devices

```text
notifications        -- Laravel notifications table (+ custom data)
  id CHAR(36) PK · type VARCHAR · notifiable_type VARCHAR · notifiable_id BIGINT
  data JSON · read_at TIMESTAMP NULL

devices              -- push tokens
  id BIGINT PK · user_id BIGINT FK
  platform ENUM('ios','android') · expo_push_token VARCHAR(255) · last_seen_at TIMESTAMP
```

## Auth support

- `personal_access_tokens` — Sanctum tokens.
- `password_reset_tokens`, `otp_codes` (phone/email OTP: identifier, code_hash, expires_at, consumed_at).
- `audit_logs` — actor_id, action, target_type, target_id, reason, meta JSON (admin/moderation actions).
