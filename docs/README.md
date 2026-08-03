# Havena — Project Documentation

> **Havena** is a hyperlocal neighborhood community platform: a mobile app, a unified web portal (admin + resident), and a Laravel API. This `docs/` folder is the **single source of truth** for product, design, data, API, and engineering decisions.

---

## 📚 How this documentation is organized

| # | Section | What's inside |
|---|---------|---------------|
| 00 | [Overview](./00-overview/) | Product vision, the 7‑Value framework, glossary |
| 01 | [Architecture](./01-architecture/) | Monorepo layout, tech stack, system diagram, environments |
| 02 | [Design System](./02-design-system/) | Design tokens, screen inventory (from Figma), navigation map |
| 03 | [Features](./03-features/) | Detailed specs for the 7 MVP features + Admin Dashboard |
| 04 | [Data Model](./04-data-model/) | ERD + MySQL schema (Laravel migrations reference) |
| 05 | [API](./05-api/) | REST conventions + OpenAPI 3.1 specification |
| 06 | [Mobile App](./06-mobile-app/) | Expo/React Native app structure and screen routing |
| 07 | [Web Portal](./07-dashboards/) | Unified Next.js frontend (admin + resident) |
| 08 | [Backend](./08-backend/) | Laravel 11 structure, conventions, auth, jobs |
| 09 | [Roadmap](./09-roadmap/) | Milestones, delivery phases, definition of done |

---

## 🧭 Product at a glance

- **Product name:** Havena (internal doc series: *Well‑Smart*, `WS-DFD-001`)
- **Tagline:** *"An app that connects neighbors while saving time, reducing friction, improving safety, improving convenience, and saving money."*
- **Audience:** Residents of a managed neighborhood / community, plus community admins & moderators.
- **MVP features:** Secure Resident Verification · Digital Notice Board · Resource Hub (Wellness) · Property Management · Community Feed · Neighborhood Marketplace · Gamification.

## 🛠️ Confirmed technology stack

> These supersede the "recommended stack" in the original product brief. **Use the stack below.**

| Area | Technology |
|------|------------|
| Mobile app | **React Native (Expo SDK 56, Expo Router)** — `apps/mobile/` |
| Web portal | **Next.js (App Router)** — `frontend/` (admin + resident in one app) |
| Backend API | **Laravel 11 (PHP 8.2+)** — `backend/` |
| Database | **MySQL 8** |
| Auth | Laravel Sanctum tokens · Email / Phone (SMS OTP) / Google / Apple · Biometric unlock on device |
| Realtime & notifications | Laravel broadcasting (Reverb/Pusher) + Expo Push Notifications |
| API contract | **OpenAPI 3.1** (Swagger UI), kept in sync with Laravel routes |

## 🎨 Design source of truth

The mobile UI **strictly follows** the Figma file:

> **Havena‑App** — <https://www.figma.com/design/jm6QleNo5bYJxu5lxGCAGL/Havena-App?node-id=1430-3533>

The full list of designed screens is catalogued in [02-design-system/screen-inventory.md](./02-design-system/screen-inventory.md). Any UI built must match these frames pixel‑for‑pixel (spacing, color, typography, radii). Deviations require a design ticket.
 
---

## ✅ Definition of "ready to build"

A feature is ready to implement when it has: (1) a feature spec in `03-features`, (2) data model entries in `04-data-model`, (3) endpoints in the OpenAPI spec, and (4) matching Figma frames. This documentation establishes all four before development starts.
