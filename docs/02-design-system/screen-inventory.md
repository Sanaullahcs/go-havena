# Screen Inventory (from Figma)

> Source: **NeighborLink‑App** Figma file, canvas *"APP REVAMP"*. <https://www.figma.com/design/jm6QleNo5bYJxu5lxGCAGL/NeighborLink-App?node-id=1430-3533>
>
> Every frame is **390px** wide (iPhone). The mobile app must match these frames exactly. The "Implemented" column maps each frame to the existing Expo route/component so design ↔ code stays traceable.

## Onboarding & Auth

| Figma frame | Implemented route |
|-------------|-------------------|
| Splash | `app/index.js` (entry) |
| Sign up with Phone / Active state | `app/screens/signup/index.jsx`, `app/screens/login/verify-phone/index.jsx` |
| Otp / Otp – Filled | `components/ui/otp-input.jsx` |
| Welcome back | `app/screens/login/index.jsx` |
| Verify | `app/screens/verifyregistration/index.jsx` |
| Signup Admin/Resident · Admin · Resident | `app/screens/roles/index.jsx` (role select) |
| Face ID · Touch ID · Verification successful | `components/biometric/faceid-dialog.jsx`, `fingerprint-dialog.jsx` |
| Select Region | `app/screens/region/index.jsx` |
| Enter Invite Code | `app/screens/invite-code/index.jsx` |
| Request to Add Community | `app/screens/request-for-community/index.jsx` |
| Complete Profile | `app/screens/complete-profile/index.jsx` |

## Home & Navigation

| Figma frame | Implemented |
|-------------|-------------|
| Final and Approved Homescreen | `app/(tabs)/home.jsx` + `components/new-home/*` |
| Home – first time | first‑run home variant |
| Menu (side) | `components/ui/side-menu.jsx` |
| CreateMenu / Sub‑Menu | `components/ui/CreateNewModal.jsx` |
| BottomNavBar (The Anchor) | `app/(tabs)/_layout.jsx` |

## Feature 2 — Digital Notice Board

| Figma frame | Implemented |
|-------------|-------------|
| Noticeboard | `app/(tabs)/notices.jsx`, `components/home/noticeBoard.jsx`, `components/new-home/Notices.jsx` |
| Create Notice / Create Notice – Filled | `app/screens/create-notice/index.jsx` |
| Create Event | `app/screens/create-event/index.jsx` |
| Create Alert | `app/screens/create-alert/index.jsx` |
| Event Details | `app/screens/event-detail/index.jsx` |
| Add a new post | `app/screens/create-post/index.jsx`, `app/(tabs)/create-post.jsx` |

## Feature 3 — Resource Hub (Wellness)

| Figma frame | Implemented |
|-------------|-------------|
| Wellness Hub | `app/(tabs)/wellness/index.jsx`, `components/new-home/Wellness.jsx` |
| Weight and Diet (pillar) | `app/(tabs)/wellness/wellness-detail.jsx` |
| Balanced Nutrition Basics (lesson) | `app/(tabs)/wellness/lessons.jsx` |
| Balanced Nutrition Basics – Video | `app/(tabs)/wellness/lessonVedio.jsx` |

## Feature 4 — Property Management

| Figma frame | Implemented |
|-------------|-------------|
| Property hub | `app/screens/property-management/index.jsx`, `components/new-home/Property.jsx` |
| Amenities / All Facilities | `app/screens/property-management/amenity/*` |
| Reservation Calendar / Rule details | `.../amenity/all-facilities/reservation-calender/*` |
| Community Rules | `app/screens/property-management/community-rules/index.jsx` |
| Documents | `app/screens/property-management/documents/index.jsx` |
| My Booking | `app/screens/property-management/my-booking/index.jsx` |

## Feature 5 — Community Feed

| Figma frame | Implemented |
|-------------|-------------|
| Community Feed (home widget) | `components/home/communityFeed.jsx` |
| Comments | feed comment screen |
| Search Topics / Search Results | feed search |

## Feature 6 — Neighborhood Marketplace

| Figma frame | Implemented |
|-------------|-------------|
| Neighborhood Marketplace | `app/(tabs)/marketplace/index.jsx`, `all-marketplace.jsx` |
| Deals & Offers / Deal – details | `app/(tabs)/marketplace/deals-offer.jsx`, `deal-details.jsx` |
| Coupons / My Coupons | `app/(tabs)/marketplace/my-coupons.jsx` |
| Redeem Coupon / Coupon Redeemed | `redeem-coupon.jsx`, `confirm-redeem.jsx` |
| Reviews / Write Review | review screens |
| Manage Marketplace / Manage Marketplace – Deals | `manage-marketplace.jsx` |
| Add Business | `add-business.jsx` |
| Create Deal / Create Deal – Filled | `create-deal.jsx` |
| Listing view / Listing – Detail View / List an Item | `app/screens/marketplace-listings/index.jsx` |
| Neighborhood Marketplace (ADMIN) Coupon | admin coupon mgmt |
| User / User – Service | provider profile views |

## Feature 7 — Gamification

| Figma frame | Implemented |
|-------------|-------------|
| Achievements / badges | `app/screens/achievements/index.jsx`, `components/profile/recentAchievements.jsx` |
| Leaderboard | `app/screens/leaderboard/index.jsx` |
| Points history | `app/screens/profile/points-history/index.jsx` |
| Profile + stats | `app/screens/profile/index.jsx`, `components/profile/profilestats.jsx` |

## Cross‑cutting

| Figma frame | Implemented |
|-------------|-------------|
| Notifications | `app/screens/notification/index.jsx` |
| Settings | `app/screens/settings/index.jsx` |

> Note: some frames labelled *"Vas's Idea"* are exploratory; build only against **"Final and Approved"** frames unless a design ticket promotes an exploration.
