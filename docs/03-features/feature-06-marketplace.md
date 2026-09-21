# Feature 6 — Neighborhood Marketplace

**Monetary Value · Priority P0 · Platforms: iOS, Android, Admin Dashboard · Dependencies: Auth, Community Membership**

## Purpose

Help the community **save money**: local business discovery, exclusive coupons/deals, community‑vetted providers, reviews, and resident peer listings.

## Sub‑modules

1. **Business directory** — local businesses with profiles, categories, reviews.
2. **Deals & Coupons** — offers residents can redeem (QR/confirmation).
3. **Reviews** — ratings + written reviews of businesses.
4. **Resident Listings** — residents list items/services for sale (peer‑to‑peer).
5. **Manage Marketplace** — business owner/admin tools.

## User stories

Browse marketplace; filter by category; view business detail; view deals/offers; view a deal detail; save a coupon ("My Coupons"); redeem a coupon → confirmation; write/read reviews; (business/admin) add a business, create a deal, manage listings; resident: list an item, view listing detail; report a listing/business.

## Data model

```text
Business
├── id / community_id / owner_id (nullable)
├── name / category / description / logo_url / images: json
├── address / phone / website
├── rating_avg: decimal / rating_count: int
└── status: enum(active, pending, hidden)

Deal (coupon/offer)
├── id / business_id / community_id
├── title / description / image_url
├── discount_type: enum(percent, amount, bogo, other)
├── discount_value: decimal (nullable)
├── code: string (nullable)
├── starts_at / ends_at
├── redemption_limit: int (nullable)
└── status: enum(active, expired, paused)

Redemption
├── id / deal_id / user_id
├── code: string (QR payload)
├── redeemed_at: timestamp (nullable)
└── status: enum(saved, redeemed, expired)

Review
├── id / business_id / author_id
├── rating: int (1–5) / body: text
└── timestamps

Listing (resident peer listing)
├── id / community_id / seller_id
├── type: enum(item, service)
├── title / description / price / images: json
└── status: enum(active, sold, removed)
```

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/communities/{cid}/marketplace/businesses` | List businesses (`?category=`) |
| GET | `/api/v1/businesses/{id}` | Business detail + deals + reviews |
| POST | `/api/v1/communities/{cid}/businesses` | Add business (owner/admin) |
| GET | `/api/v1/communities/{cid}/deals` | List deals/offers |
| GET | `/api/v1/deals/{id}` | Deal detail |
| POST | `/api/v1/deals/{id}/save` | Save coupon to "My Coupons" |
| POST | `/api/v1/deals/{id}/redeem` | Redeem → returns confirmation/QR |
| GET | `/api/v1/me/coupons` | My saved/redeemed coupons |
| POST | `/api/v1/businesses/{id}/reviews` | Write review |
| POST | `/api/v1/businesses/{id}/deals` | Create deal (owner/admin) |
| GET | `/api/v1/communities/{cid}/listings` | Resident listings |
| POST | `/api/v1/communities/{cid}/listings` | List an item/service |
| GET | `/api/v1/listings/{id}` | Listing detail |

## Permission matrix

| Action | Resident | Business Owner | Moderator | Admin |
|--------|:--------:|:--------------:|:---------:|:-----:|
| Browse businesses/deals | ✓ | ✓ | ✓ | ✓ |
| Save / redeem coupons | ✓ | ✓ | ✓ | ✓ |
| Write reviews | ✓ | ✓ | ✓ | ✓ |
| Create resident listing | ✓ | ✓ | ✓ | ✓ |
| Add business / create deals | ✗ | ✓ (own) | ✗ | ✓ |
| Hide/approve businesses & listings | ✗ | ✗ | ✓ | ✓ |

## Screens

Marketplace home, Deals & Offers, Deal details, Coupons / My Coupons, Redeem Coupon → Coupon Redeemed, Reviews / Write Review, Manage Marketplace / Manage Marketplace – Deals, Add Business, Create Deal / Create Deal – Filled, Listing view / Listing – Detail View / List an Item, User / User – Service (provider profiles), Neighborhood Marketplace (ADMIN) Coupon.

## Acceptance criteria

- Redeeming a coupon enforces `redemption_limit` and validity window; produces a single‑use confirmation/QR.
- Reviews recompute `rating_avg`/`rating_count` on the business.
- New businesses/listings may require admin approval (configurable) before going live.
