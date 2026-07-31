# Feature Specifications

Each MVP feature has a dedicated spec following the same template: **purpose · user stories · data model · API endpoints · permission matrix · screens · acceptance criteria**.

| # | Feature | Priority | Primary Value | Spec |
|---|---------|----------|---------------|------|
| 1 | Secure Resident Verification | P0 | 🔒 Safety | [feature-01](./feature-01-resident-verification.md) |
| 2 | Digital Notice Board | P0 | 🏠 Local | [feature-02](./feature-02-notice-board.md) |
| 3 | Resource Hub (Wellness) | P0 | 📚 Information | [feature-03](./feature-03-resource-hub.md) |
| 4 | Property Management | P0 | ⚡ Friction | [feature-04](./feature-04-property-management.md) |
| 5 | Community Feed | P0 | 💬 Interactive | [feature-05](./feature-05-community-feed.md) |
| 6 | Neighborhood Marketplace | P0 | 💰 Monetary | [feature-06](./feature-06-marketplace.md) |
| 7 | Gamification | P1 | 💬 Interactive | [feature-07](./feature-07-gamification.md) |
| — | Admin Dashboard | P0 | (operational) | [feature-08](./feature-08-admin-dashboard.md) |

**Platforms:** unless noted, every feature targets **iOS, Android, and the Admin Dashboard**. The User Dashboard exposes a web subset (read + lightweight write).

**Permission roles:** `resident` (member) · `moderator` · `admin`. Matrices use ✓ (allowed) / ✗ (denied).
