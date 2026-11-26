# Landlord Feature — Finalized Requirements

**Status:** Approved for implementation planning  
**Last updated:** 2026-11-26 (billing contact sync by occupancy; rented owner view-only when tenant pays)  
**Scope:** Landlord capability for unit owners within a community — mobile resident app, thin landlord tools on mobile, and a **Landlord Dashboard** on web (`frontend/`, e.g. `/landlord/*`).

**Principle:** Extend existing **community membership**, **unit associations**, **billing contact**, **resident verification**, and **admin invitation** models. Landlord is **not** a third signup role; it is derived from **per-unit ownership**, **occupancy**, and **approved access**.

**Related docs:**

- [`multiple-units-single-community-requirements.md`](multiple-units-single-community-requirements.md) — multi-unit links, billing contact, admin invite Path A.
- [`multiple-units-per-resident-requirements.md`](multiple-units-per-resident-requirements.md) — multi-community membership (landlord hub picker when 2+ landlord communities).

---

## 1. One-line policy

> **Resident app** = approved **community membership** with either an approved **residency** (a unit where you live) **or** approved **ownership** of a unit you do **not** live in (`rented` or `vacant`). **Landlord tools** = approved ownership of at least one `rented` or `vacant` unit. A homeowner who does not live in the unit gets **both** the full resident app and landlord tools. There is **no owner-only lockout**. Signup stays **Homeowner / Tenant** only. **My Units → Become a Landlord** (per community) is only for people who are **not** already an approved landlord. **Billing contact** is per unit. **Community admin always final**; landlord approve/reject is **advisory** when the unit is **Rented** and a landlord is on file.

---

## 2. Goals and non-goals

### Goals (v1)

- Support **homeowners** who do **not** live in a unit (rented or vacant) with **both** full **resident** access and full **landlord** access on the same login.
- Support **dual access** on one login in every qualifying case: Use Case 1 (non-resident owner), Use Case 3 (live in one unit, own another), and Use Case 4 (tenant in one unit, own another).
- Per owned unit: single **occupancy** state — **Live here | Rented | Vacant**.
- **Landlord Dashboard** (web) for portfolio, occupancy, tenant-related approvals, and **bill payment status** on rented units.
- Thin **My properties** (and approvals) on mobile; optional **Resident | Landlord** mode switcher when both apply.
- **Billing (v1):** owner pays bills for **owner-occupied** and **vacant** units; for **rented** units, landlord **views Paid/Unpaid only** (does not pay through landlord dashboard).
- Reuse **admin invite** and **multi-unit** rules; landlord extends ownership and occupancy, does not replace invites.

### Non-goals (v1)

- Separate **Landlord** signup role at registration.
- Auto-promote to landlord when user buys/claims a second unit (always **opt-in** / claim flow).
- In-app **sale/MLS** pipeline; **co-ownership**; **rent collection** / leases product; **landlord messaging center**.
- Landlord reject **blocking** community admin approval.
- An **owner-only** shell that hides the resident app from a non-resident owner.
- Treating approved ownership of a rented or vacant unit as a reason to close the feed, messages, amenities, or other resident features.

---

## 3. Core concepts

| Concept | Meaning |
|--------|---------|
| **User** | One login (email/phone). |
| **Community membership** | One membership per user per community; one **resident seat** per person per community regardless of unit count. |
| **Unit association (resident)** | Link user ↔ unit as **resident** (tenant or owner-occupier); drives **resident app** when approved. |
| **Unit ownership** | Link user ↔ unit as **owner**; requires **admin approval** of ownership claim (v1). |
| **Occupancy** (per owned unit) | Exactly one: `live_here` \| `rented` \| `vacant`. Not three independent booleans. |
| **Primary residence** | At most **one** unit per community where the user has approved **live_here** residency (v1 field or equivalent). |
| **Landlord enabled** | Per user per community: user has completed **Become a Landlord** / ownership claim path where product requires explicit opt-in (see §6). |
| **Billing contact** | Per **unit**; who can view/pay bills for that unit (existing model). |
| **Landlord advisory status** | On tenant membership requests for **rented** owned units: `approved` \| `rejected` \| `pending` — **does not** block admin. |

### Derived capabilities (per community)

| Capability | When true |
|------------|-----------|
| **Full resident app** | Approved membership **and** either (a) approved **residency** on at least one unit, or (b) approved **ownership** of at least one unit with occupancy **`rented` or `vacant`**. Not living in the owned unit does **not** remove this. |
| **Owner-only lockout** | **Retired.** Do not hide resident features, redirect to a landlord-only shell, or return `owner_only` as a reason to close the feed. |
| **Landlord dashboard access** | Approved **ownership** on ≥1 unit with occupancy **`rented` or `vacant`** in that community (see §6). |
| **Resident + landlord together** | Use Case 1 (non-resident owner), Use Cases 3–4, and the multi-hat example in §8. |

**Ownership ≠ living in the unit:** A rented or vacant owner is **not** an active resident **of that unit**. They are not on that unit’s tenant roster and they do not become the billing contact of a rented unit. That unit-level split does **not** remove community resident features.

---

## 4. Signup and roles

| Signup choice | Meaning |
|---------------|---------|
| **Homeowner** | User claims ownership of a unit (subject to proof + admin approval). |
| **Tenant** | User lives in a unit they do not own (subject to proof + admin approval). |
| ~~Landlord~~ | **Not offered** at signup. |

### Homeowner path — required questions (per unit claimed)

After unit selection, for **each** owned unit:

1. Set **occupancy** (single choice): **Live here** | **Rented** | **Vacant**.

Derived behavior:

| Occupancy | Residency intent | Typical access after approvals |
|-----------|------------------|--------------------------------|
| **Live here** | Ownership + residency on this unit | **Resident** (full app). No landlord dashboard from this unit alone. |
| **Rented** | Ownership of this unit; owner does **not** live here and is **not** on the unit roster | **Full resident app** and **landlord** tools. Bill status is view-only (v1). |
| **Vacant** | Ownership of this unit; owner does **not** live here and is **not** on the unit roster | **Full resident app** and **landlord** tools. Owner is **billing contact** and pays bills (v1). |

If user selects **Live here** on a unit, they **cannot** also mark the same unit as rented/vacant (mutually exclusive enum).

### Tenant path

Unchanged at a high level: tenant on a unit they do not own → residency approval → resident app when approved.

### Become a Landlord (post-join, per community)

1. **My Units → Become a Landlord** — show this label only when the user is **not** already an approved landlord in the community. An approved landlord sees **My properties** / **Claim another unit**, not “Become a Landlord”.
2. Claim additional owned units (or first ownership if joined originally as tenant only).
3. Set **occupancy** per claimed unit.
4. Submit ownership proof → **community admin** approves ownership.

Use when:

- Owner-occupier (**Use Case 2**) later adds a **second** owned unit (rented/vacant), or changes situation without a third signup role.
- Tenant later acquires ownership on another unit.

**Clarification (Use Case 2):** “Enable landlord later” means **add another owned unit** and/or **change occupancy** when they move out (e.g. home becomes `vacant`/`rented` and residency moves to another unit as tenant)—not “landlord dashboard for rent collection while still living in sole owned home.”

---

## 5. Product use cases (agreed)

### Use Case 1 — Owner, does not live; unit rented or vacant

- Signs up **Homeowner**, provides unit, sets occupancy **Rented** or **Vacant**.
- After **admin approves ownership**: **both** the full resident app **and** landlord tools in that community. Do **not** redirect them to a landlord-only experience and do **not** label them “Become a Landlord”.
- They are **not** an active resident of the owned unit (roster and multi-resident rules stay unchanged).
- **Pays bills** for a **vacant** unit; for a **rented** unit, **views** tenant bill status only (v1 billing). Resident features do not override that pay block.

### Use Case 2 — Owner-occupier

- Signs up **Homeowner**, sets occupancy **Live here**.
- After approvals: **resident only** (full resident app).
- May **later** enable landlord path via **My Units → Become a Landlord** when they add another owned (rented/vacant) unit or change occupancy / residency as in §4.

### Use Case 3 — Two units: live in one, rent the other

- Unit A: homeowner, **Live here**.
- Unit B: homeowner, **Rented** or **Vacant**.
- After approvals: **both Resident and Landlord** — resident home anchored to A (primary residence); **My properties** / Landlord Dashboard for B.
- Billing: pay A (and B if vacant); view-only bill status on B if rented (v1).

### Use Case 4 — Tenant in one unit, owner of rented/vacant other

- Unit A: **Tenant** (lives here) — primary residence.
- Unit B: **Homeowner**, **Rented** or **Vacant**.
- After approvals: **both Resident and Landlord** on one login.
- Approvals on A (residency) and B (ownership) are **independent**.

---

## 6. Landlord dashboard access rule (v1, agreed)

User may open **Landlord Dashboard** in a community when **all** are true:

1. Active **community membership** (or equivalent access to that community).
2. **Admin-approved ownership** on at least one unit in that community.
3. At least one owned unit has occupancy **`rented` or `vacant`**.

User with **only** one owned unit marked **`live_here`** and no other approved owned rented/vacant units → **no** landlord dashboard (resident only) until §4 post-join path adds a qualifying unit or occupancy changes.

**Multi-community:** If user is landlord in **2+** communities → **community picker** on entry; **1** community → straight into dashboard (existing decision).

**Surfaces:**

| Surface | Audience |
|---------|----------|
| Mobile resident app | Full resident navigation for anyone with resident-app access, including Use Case 1, plus **My properties** / approvals |
| Web resident portal | Full resident navigation (feed, messages, notices, and the rest). Do not redirect Use Case 1 users to `/landlord`. |
| Web **Landlord Dashboard** (`/landlord/*`) | Portfolio, occupancy, approvals, bill status (rented), in addition to the resident portal |
| Web admin portal | Unchanged; admin remains system of record for membership |

---

## 7. Billing (v1, agreed)

| Unit occupancy | Who pays bills (v1) | Landlord dashboard |
|----------------|--------------------|--------------------|
| **Live here** (owner-occupier) | Owner as **billing contact** | N/A for “landlord pay” on that unit in dashboard (lives in resident / bills UX) |
| **Vacant** | **Owner** (billing contact) | Pay + manage per existing per-unit billing |
| **Rented** (+ approved tenant / billing contact rules) | **Tenant** (or existing billing contact rules) | Landlord **views Paid / Unpaid only**; **cannot pay** through landlord dashboard |

### Billing contact transitions (document for implementation)

**Source of truth:** `units.billing_contact_user_id` — one billing contact **per unit**, unchanged for normal owner-occupier and tenant-only units (no approved `rented` / `vacant` ownership on that unit).

**Automatic rules** (backend enforces; UI reflects):

| Unit occupancy (approved ownership) | Billing contact | Who may pay (v1) |
|--------------------------------------|-----------------|------------------|
| **Vacant** | **Current owner** (always) | Owner |
| **Rented**, no **admin-approved** active tenant yet | Unchanged (typically **owner**) | Owner until a tenant is billing contact |
| **Rented**, tenant **approved** (active `unit_residents`) | **Approved tenant** (first eligible active resident; existing per-unit rules) | Tenant; landlord **view-only** |
| **Live here** | Existing resident billing rules (owner as occupier) | Unchanged from today |

| Event | Billing contact | Pay / view |
|-------|-----------------|------------|
| Owner marks unit **vacant** | **Immediately** set to current approved owner | Owner pays |
| Owner marks unit **rented** | **No change** until a tenant is admin-approved active | Owner pays while still billing contact |
| Tenant request **pending** admin approval | **No change** | Unchanged |
| Tenant **approved** on **rented** unit | **Switch to** that tenant (or first eligible active resident) | Landlord view-only for that unit; tenant pays |
| Last active tenant leaves; occupancy still **rented** | **Revert to owner** | Owner pays again until a new tenant is approved |
| Tenant leaves / occupancy → **vacant** | **Owner** | Owner pays |
| Owner moves in (**vacant/rented → live_here**) | Resident billing on that unit | Resident bills UX |
| Owner moves out (**live_here → vacant/rented**) | Residency ends; landlord rules above apply | Per occupancy row above |

**Enforcement:** Payment APIs must reject a **rented** owner paying when they are **not** the unit billing contact (do not rely on hiding pay buttons). Other residents on the same unit remain non-payers unless they become billing contact via existing transfer rules.

---

## 8. Multi-hat example (one user, three units)

Same community, one seat:

| Unit | Relationship | Occupancy | Capabilities | Bills (v1) |
|------|--------------|-----------|--------------|------------|
| **101** | Homeowner | Live here | Resident (e.g. primary home) | Pay |
| **205** | Tenant | — | Resident | Pay if billing contact |
| **302** | Homeowner | Rented or Vacant | Landlord for 302. Resident app still comes from 101/205, and would remain even if 101 and 205 were removed | Vacant: pay · Rented: status only |

**Navigation (v1):** One shell with resident features **and** **My properties**. Do not replace the resident shell with a landlord-only menu. Optional **Resident | Landlord** labels may highlight sections; they must not hide the other set of features. An approved landlord is never prompted to “Become a Landlord”.

---

## 8.1 Multiple residents on one rented unit (clarification)

**Yes — unchanged from today.** A **rented** unit may have **multiple** Havena accounts linked via separate **`unit_residents`** rows on the **same unit** (e.g. primary tenant + spouse/children with their own logins, admin-invited family members, or self-signup add-ons per multi-unit rules).

| Topic | Rule |
|-------|------|
| **Accounts** | One login per person; each person has their own unit association on that unit. |
| **Seats** | Each approved resident still counts as **one seat** in the community (same as existing membership rules). |
| **Billing contact** | **One per unit** (existing model). Only the billing contact pays service/utility bills for that unit; other residents on the unit use resident app features but see **“ask your billing contact”** for bills (see payments UC-A10). |
| **Family / household** | Existing **family** and invite/join flows continue; landlord feature does not replace them. |
| **Landlord occupancy** | Owner sets unit occupancy **`rented`** once at the **unit** level; it does **not** limit how many residents can be on the unit after tenants are approved. |

### Landlord Dashboard (v1) for multi-resident units

Landlord view is **unit-centric**, not a second resident-management product:

| Dashboard element | Behavior |
|-------------------|----------|
| **Unit summary** | Occupancy **Rented**; badge or count **N residents** (active vs pending if useful). |
| **Resident roster** | List **name + status** (active / pending / left) per `unit_residents` row — enough for the landlord to know who is on the lease/household; no landlord payment actions per person. |
| **Billing contact** | Show **who is billing contact** for the unit (one user). |
| **Bill status** | **Unit-level** Paid / Unpaid / Overdue (and empty state if no bill yet), derived from that unit’s bills tied to billing contact rules — **not** one bill row per non-billing resident in v1. |
| **Approvals** | If each resident joins via a separate request (self-signup or invite), **each request** may still go **landlord advisory → admin final** when the unit is rented and landlord is on file; landlord does not approve “the whole household” in one click unless the product bundles requests (v1: **per person / per request** as today). |

Landlord **cannot** pay bills for the unit in the dashboard when rented (v1). Landlord **does not** need separate dashboards per family member — one **unit card** with roster + aggregate bill status.

### Out of scope (v1)

- Landlord editing another resident’s profile or removing them (stay **admin** / resident flows).
- Combined household signup as one landlord approval for multiple adults (unless existing admin bulk-invite already does multiple unit rows — still **one approval path per person** where applicable).

---

## 9. Tenant approval chain (rented owned units)

| Situation | Flow |
|-----------|------|
| Tenant requests **before** landlord/owner on file | **Admin only** (today’s behavior). |
| Unit **not** marked rented | Landlord step **not** required. |
| **Rented** + landlord/owner on file | **Landlord** Approve / Reject (advisory, status badge) → **Admin** Approve / Reject (**independent**). |
| Landlord **rejects** | Admin **may still approve** (hard requirement). |
| Landlord **approves** | Admin **must still approve** for access. |

**Implementation rule:** `admin_approve` never requires `landlord_status === approved`.

---

## 10. Admin-invited resident (Path A) — interaction with landlord

Unchanged from multi-unit Path A unless extended for ownership:

### Initial invitation

1. Admin invites resident with **one or more units** (invite code, email/link/QR).
2. Initial unit links are **administratively approved** (no self-signup unit registration queue for those units).
3. Invitee completes onboarding + **per-unit proof**; no full app until complete.
4. **One seat** per person per community.

### Billing contact on invite

- **Existing unit:** billing contact unchanged.
- **New unit:** invitee typically becomes billing contact when unit is created/activated per existing rules.

### Inviting a **tenant** to a **rented** unit that has an on-file landlord/owner

1. Admin invite / membership request proceeds per existing flows.
2. If product rules require landlord advisory step: landlord approve/reject → admin final.
3. Landlord of record sees unit in dashboard; bill status **view-only** once tenant is billing contact.

**Do not** invite the same person as **tenant on their own owned unit**; use **ownership + occupancy + residency** records instead.

### Additional units after onboarding

- **Add-on** unit requests → admin approve/reject; rejection does **not** revoke existing units (existing multi-unit rule).

---

## 11. Self-signup (Path B) — ownership and landlord

- Initial package may include **multiple units** with separate proof per unit (see multi-unit doc).
- **Ownership claims** and **occupancy** captured at signup; **admin approves** ownership/residency packages per existing extended workflows.
- **Pending** states: user may log in but **no full resident** or **landlord dashboard** until relevant approvals complete (align with §14).

---

## 12. Sale / owner change (v1, thin)

- **No** in-app sale wizard.
- **Admin** reassigns owner on unit → notify new owner → new owner sets occupancy (**Live here | Rented | Vacant**).
- Existing tenant on sold unit: handled **manually** in v1 (no automatic lease inheritance).
- Former owner loses landlord scope on that unit when ownership transfers.

---

## 13. Edge cases and invalid states

| Edge case | Expected behavior |
|-----------|-------------------|
| **Live here** and **Rented** on same unit | **Prevent** at UX/API (single occupancy enum). |
| Owner selects live here on unit that is already rented with tenant | Block or force correction workflow (admin may need to reconcile). |
| Use Case 1 owner opens the resident feed | **Allow.** They have the full resident app and landlord tools. Do not redirect and do not return an owner-only denial. |
| Use Case 1 user is shown “Become a Landlord” | **Do not.** They are already an approved landlord. Offer the portfolio and “Claim another unit”. |
| Use Case 1 user is listed on the rented/vacant unit roster | **Do not.** They do not live there. Tenants on that unit stay the only `unit_residents`. |
| Tenant on unit before owner claims landlord path | Tenant flow: **admin only** until owner on file. |
| Rented unit, no tenant yet | Landlord pays **nothing** for tenant bills; vacant billing rules if utilities still owner; empty state vs **Unpaid** must be clear in UI. |
| Two rented units, two tenants | Dashboard lists units; status **per unit**; no cross-unit pay in v1. |
| **Multiple residents on one rented unit** | Allowed; each own account + `unit_residents` row; **one billing contact**; landlord sees **roster + unit bill status** (§8.1). |
| Extra family member joins after primary tenant | Separate membership/invite path; landlord advisory per request if rules apply; roster count updates. |
| User changes **205** residency without updating **302** ownership | Independent records; access resolver recalculates capabilities. |
| Owner-only in community A, resident in community B | **Per-community** capabilities. Community A (rented/vacant ownership, no home) still gets **both** resident and landlord access. Community B follows its own residency and ownership. |
| **Become a Landlord** without approved ownership | Tools remain locked until admin approves claim. |
| Landlord ignores tenant request | Admin still sees request with landlord badge / pending advisory status (timeout SLA **deferred**). |
| Demo / billing-exempt communities | Dashboard copy must not imply real payment rails. |
| Suspension / ban | Overrides all resident and landlord access (existing rules). |

---

## 14. Application access summary

| State | Log in? | Resident app? | Landlord dashboard? |
|-------|---------|---------------|---------------------|
| Ownership pending | Yes | Only if separate approved residency | No |
| Ownership approved, all owned units `live_here` only, no residency approved yet | Yes | No, until residency on that unit is approved | No |
| Non-resident owner (approved ownership, no residency, rented/vacant) — Use Case 1 | Yes | **Yes** — full resident app | **Yes** |
| Approved residency (any unit) | Yes | Yes | If also qualifying ownership |
| Residency + ownership (Use Cases 3–4) | Yes | Yes | Yes |
| Admin-invited, onboarding incomplete | Yes | No | No |
| Add-on ownership/rented unit pending | Yes | Per existing active units | Per approved units only |

---

## 15. UX and navigation (v1)

- **Primary residence**, when the user lives in a unit, drives the default **home** context (one per community). Use Case 1 has no primary residence and still uses the normal resident home, feed, and menus.
- **My properties:** owned units with `rented` / `vacant` (and management actions allowed in v1).
- **Landlord Dashboard (web):** unit list, occupancy, tenant/approval queue, bill **status** for rented units. Reachable **in addition to** resident pages, not instead of them.
- **Do not** redirect non-resident owners away from resident routes, and **do not** collapse web or mobile navigation to landlord/property only.
- **Resident | Landlord mode switcher:** optional v1. If present, it must not remove the other capability. Prefer **My home / My properties** sections in one shell.
- **Invite tenant from dashboard:** optional v1 (not required for launch).
- Copy: approved landlords see **Claim another unit** (or equivalent). **Become a Landlord** is only for users who do not yet have an approved rented or vacant ownership in that community.

---

## 16. Data model sketch (implementation)

Not yet built; planning reference only:

- **Unit ownership** record (user, unit, community, status, approved_at, proof refs).
- **Occupancy** on ownership: enum `live_here | rented | vacant`.
- **Landlord enabled** flag per (user, community) if explicit opt-in required beyond ownership.
- **Primary residence** unit id per (user, community).
- **`landlord_membership_reviews`** — advisory landlord approve/reject per tenant membership request (independent of admin status).

Access resolver (backend): `resolveUserCommunityAccess(user, community)` → `{ resident, landlord, ownerOnly, units: [...] }`.

- `resident` is the **resident app** flag from §3 (residency **or** approved rented/vacant ownership). It is not “lives in the owned unit”.
- `ownerOnly` is **always false** for Use Case 1. Do not gate routes on it. The field may remain in the payload for older clients, but clients must ignore it and must not hide resident navigation.

---

## 17. Suggested implementation order

1. Backend data model + migrations.  
2. Admin ownership approval + occupancy.  
3. Access resolver: resident app includes Use Case 1; no owner-only route gate.  
4. Signup / add-unit: occupancy + living-here.  
5. **Become a Landlord** flow.  
6. Tenant approval pipeline (non-blocking landlord status).  
7. Mobile: My properties + approvals.  
8. Web: Landlord Dashboard (`/landlord/*`).  
9. Multi-community landlord picker.  

**Regression:** Multi-unit billing contact, admin invite lifecycle, per-unit bills, seat counting, and admin-final membership rules must remain intact.

---

## 18. Open items (deferred — not blocking v1 kickoff)

| Topic | Default for v1 |
|-------|----------------|
| Invite tenant from landlord dashboard | Optional; may ship later |
| Resident \| Landlord switcher vs sections-only | Choose one in UI sprint 1 |
| Landlord advisory timeout SLA | Admin always can act; no auto-expiry required in v1 |
| Owner read-only notices without living in a unit | **Not used.** Use Case 1 gets the normal resident app, not a read-only substitute. |
| Exact copy for “Try again” / rate limits | Product copy only |

---

## 19. Decision log

| Topic | Decision |
|-------|----------|
| Landlord signup role | **No** — Homeowner / Tenant only |
| Occupancy | Single enum per owned unit: **live_here \| rented \| vacant** |
| Ownership vs living in the unit | **Separate** for roster and billing. Approved rented/vacant ownership still grants the **full resident app** plus landlord tools. |
| Owner-only experience | **Removed** for non-resident owners (2026-11-26 revision). |
| Landlord dashboard gate | Approved ownership + ≥1 unit **rented or vacant** in community |
| Primary residence | **One** per community (v1) |
| Dashboard host | Web **Landlord Dashboard** in `frontend/` (e.g. `/landlord/*`) |
| Billing v1 | Pay **live_here + vacant**; **view only** on **rented** |
| Tenant approval | Landlord advisory → **admin final**; reject does not block admin |
| Multi-community landlord | Picker if **2+**; else direct entry |
| Sale | Admin reassignment only in v1 |
| Co-ownership, MLS, rent product, landlord messaging | **Out of v1** |
| Relation to multi-unit docs | **Extend**; do not replace invite or billing contact model |
| Multiple residents per rented unit | **Yes** — same as existing; landlord UI is unit + roster + billing contact + bill status |

---

## 20. Conversation sources

Product threads consolidated into this document:

- Form city field addition / landlord discussions (`ccd4505d`, `e9ae394f`, `5ad96d87`).
- Use cases 1–4, v1 billing, triple-unit (homeowner + tenant + landlord), and admin invite alignment (2026-11-26).
- Use Case 1 revision: rented or vacant owners keep full resident features and landlord features; no owner-only shell (2026-11-26).

---

*This document is the implementation reference for the Landlord feature. Engineering should align tickets and acceptance tests with §5, §9, §13, and §14.*