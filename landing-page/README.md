# Havena — Landing Page

A premium, modern, fully responsive marketing landing page for Havena, built as a **standalone Next.js 16 + React 19 + Tailwind CSS v4** application.

This is a **separate, dedicated project** and does **not** modify the existing mobile app (`apps/mobile`) or the existing dashboards Next.js app (`frontend`).

## Stack

- **Next.js 16** (App Router, RSC)
- **React 19**
- **Tailwind CSS v4** (PostCSS plugin)
- **TypeScript**
- Custom inline-SVG icon set so the bundle stays small and animations are silky.
- Custom inline-SVG hero / step illustrations (no external image deps for the
  background art — only Unsplash URLs for the event thumbnails).

## Brand alignment

Colors, typography, radii, and shadows mirror the reference design:

| Token            | Value                       |
|------------------|-----------------------------|
| `brand`          | `#4338CA` (indigo)          |
| `brand.deep`     | `#312E81`                   |
| `brand.end`      | `#818CF8`                   |
| `brand.soft`     | `#EEF2FF`                   |
| `ink.primary`    | `#0F172A`                   |
| `ink.body`       | `#475569`                   |
| `ink.muted`      | `#94A3B8`                   |
| `surface.muted`  | `#F8FAFC`                   |
| `radius.card`    | `20px`                      |
| `radius.button`  | `12px`                      |
| `radius.pill`    | `9999px`                    |
| Type family      | Inter (web, via `next/font`)|

## Page structure

```
landing-page/
├── public/              # Brand assets copied from mobile (read-only source)
│   ├── main-logo.png
│   ├── n-logo.png
│   ├── n-icon.png
│   ├── app-icon.png
│   └── favicon.png
└── src/
    ├── app/
    │   ├── globals.css  # Tailwind v4 + design tokens
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/
    │   ├── ui/          # Button, Container, Logo (atoms)
    │   ├── icons/       # Custom inline SVG icon set
    │   └── sections/    # Header, Hero, BenefitsRow, Features,
    │                    # HowItWorks, Testimonials, CTA, Footer
    └── lib/
        └── site.ts      # Site copy, primary nav, footer columns
```

## Sections (top → bottom)

1. **Header** — sticky transparent → white-on-scroll, brand mark, primary nav
   (Home, Features, How It Works, About Us, Pricing, Contact), Get Started CTA.
2. **Hero** — deep indigo gradient, neighborhood illustration backdrop,
   eyebrow pill, two-line headline with gradient on the second line, body,
   two CTAs, avatars + 5-star trust row, floating "This week" event card.
3. **BenefitsRow** — 4 benefit cards overlapping the hero/light boundary:
   Growing Every Day, Events That Bring Us Together, Safe & Verified
   Neighborhoods, Communities That Rate Us Highly.
4. **Features** — "Everything You Need" eyebrow + "One Platform. Seven
   Powerful Features." headline, 4×2 grid of feature cards (Secure & Verified,
   Digital Notice Board, Resource Hub, Property Management, Community Feed,
   Neighborhood Marketplace, Gamification, Admin Dashboard).
5. **HowItWorks** — dark gradient section with "Simple. Smart. Connected."
   eyebrow, "How Havena Works" headline, 4 step circles with dashed
   connector (Join Your Community, Stay Informed, Connect & Engage, Earn &
   Grow).
6. **Testimonials** — "Loved by Communities" eyebrow, "Neighbors Love
   Havena" headline, 3 testimonial cards.
7. **CTA** — dark gradient panel with house illustration + "Ready to build a
   stronger, more connected community?" + App Store / Google Play buttons.
8. **Footer** — dark footer with brand + tagline, Quick Links, Support, Follow
   Us socials, copyright.

## Run

```bash
cd landing-page
npm install
npm run dev   # http://localhost:3001
```

## Editing link targets

The **Sign Up** and **Profile** buttons are intentionally not wired to any
backend. Open [`src/lib/site.ts`](./src/lib/site.ts) and update the
`actionLinks` href values to point at the real URLs when ready — no other
changes needed.
