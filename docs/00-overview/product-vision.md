# Product Vision

## What Havena is

Havena is a **hyperlocal community platform** that lets verified residents of a neighborhood connect, stay informed, share resources, manage property/amenities, discover local deals, and engage through gamified participation — inside a safe, moderated environment.

It is **not** a generic social network. The experience is designed to feel **alive, premium, and habit‑forming from the first screen**, anchored to a single physical community (e.g. *Oak Valley, Austin TX*).

## Core experience goals

- Create a visually immersive, modern home experience.
- Encourage daily interaction and community participation.
- Make residents feel emotionally connected to their neighborhood.
- Reduce friction with **guest browsing before signup**.
- Provide scalable tools for admins and moderators.

## Design direction

Combine the **emotional warmth** of a community app with the **polish** of a modern social platform.

| Category | Direction |
|----------|-----------|
| Visual style | Modern, premium, warm, social‑first |
| Typography | Bold headlines + clean, readable body text |
| Animations | Fluid transitions, motion‑based micro‑interactions |
| Home screen | High‑engagement widgets + personalized discovery |
| Color palette | Warm neutrals with vibrant accent gradients (brand blue `#007BFF` → `#0052DF`) |
| UX focus | Low‑friction navigation with fast access to content |

## WOW‑factor home experience

The home screen must create immediate emotional impact:

- Personalized welcome based on neighborhood activity.
- Live community cards with motion and micro‑interactions.
- Trending discussions and local highlights.
- Smart widgets (weather, events, announcements).
- Gamified progress and reputation indicators.
- Immersive feed layouts with layered visual hierarchy.
- Quick actions for posting, joining events, discovering businesses.

The implemented home (see `app/(tabs)/home.jsx`) is built from stacked widget sections — **Notices → Communities → Deal Corner → Wellness → Property Management** — with a floating quick‑action launcher, matching the Figma frame *"Final and Approved Homescreen"*.

## Two audiences, three clients

1. **Residents** use the **mobile app** (primary) and the **User dashboard** (web companion).
2. **Admins & moderators** use the **Admin dashboard** to run communities, moderate content, manage the marketplace, publish notices, and read analytics.

## Moderation & safety posture

Strict moderation maintains a positive, safe atmosphere. Political content, religious conflict, discrimination, spam, harassment, and personal attacks are automatically flagged or removed (rules engine + AI‑assisted moderation + human review). Safety starts with **verified residency** — only confirmed neighbors can participate.
