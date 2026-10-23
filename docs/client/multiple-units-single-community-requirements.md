# One Resident, Multiple Units (Single Community) — Finalized Requirements

**Status:** Approved for implementation planning  
**Last updated:** 2026-03-21  
**Scope:** One Havena resident account may be linked to **multiple units within the same community**.  
**Out of scope:** Linking one resident to **multiple communities** (single community membership only for this initiative).

**Principle:** Extend current unit, billing contact, invitation, onboarding, and per-unit billing behavior. Do not replace established billing contact transfer or payment rules.

---

## 1. Goals and non-goals

### Goals

- One **resident user** can hold **multiple unit associations** in **one community**.
- **One seat / one resident count** per person in that community, regardless of unit count.
- **Bills and optional services** remain **per unit**; only the **billing contact** for a unit can view and pay that unit’s bills and buy services for that unit.
- Support **admin-invited** and **self-signup** residents with clear, different rules for **initial** unit assignment vs **additional** unit requests.
- Require **separate proof documents per unit** where proof applies.

### Non-goals (v1)

- **Multi-community** membership or community switching for one resident.
- **Primary unit** field (display defaults only; may be added later).
- **Partial approve** of a self-signup initial package (approve some units, reject others in one submission).
- **Combined payments** across units in one checkout.
- Changing **billing contact transfer** lifecycle (only extend: one transfer request per unit).

---

## 2. Core concepts

| Concept | Meaning |
|--------|---------|
| **User** | One login (email/phone). |
| **Community membership** | One approved membership in the community (existing model). |
| **Unit** | Apartment/unit record in the community. |
| **Unit association** | Link between user and unit (`unit_residents`); statuses include pending, active, rejected, left. |
| **Billing contact** | Per **unit**; controls bills and optional services for that unit only. |
| **Unit registration request** | Admin-reviewed package for **self-signup initial** units and **all add-on** unit requests. **Not** used for admin-invited **initial** unit assignments. |

### Resident and seat counting

- A person with three units in the community counts as **one resident** and **one seat**.
- Pending add-on unit requests do **not** consume extra seats.

---

## 3. Unit assignment rules (all flows)

### Select an existing unit

- **Billing contact stays unchanged** (existing behavior).
- Resident may become a **unit resident** without becoming billing contact.

### Add / create a new unit

- The resident who creates or is assigned the new unit becomes **billing contact** for that new unit (existing behavior), effective when the unit is created/approved per current rules.

### Billing contact transfer

- Managed **per unit**, independently.
- A billing contact for Unit 10 and Unit 11 may start a **separate transfer** for each unit.
- Existing transfer workflows remain unchanged.

---

## 4. Proof documents

For each unit that requires proof, the resident must provide **separately**:

1. **Utility bill** (or accepted equivalent), and  
2. **Homeownership or tenancy proof**, based on **homeowner** vs **tenant** for that unit.

Example: two units ⇒ at least four uploads (utility + role proof × 2).

- Same validation rules (file types, limits) for all paths.
- Store documents **per unit**, not only on the global profile.

---

## 5. Path A — Admin-invited resident (System or Community Admin)

### Initial invitation

- Admin may assign **one or more units** when inviting or creating a resident (existing unit and/or new unit per row).
- **Existing invitation workflow** remains: invite code, invitation sent, onboarding, membership, **one seat** — extended for multiple unit rows, not replaced.
- Initial unit links are established under **existing invitation/membership rules** and are **administratively approved** without a **unit registration request** queue for those units.

### Billing contact (initial units)

- **Existing unit:** billing contact unchanged.  
- **New unit:** invited resident becomes billing contact for that new unit.

### Proof at profile completion

- Resident must submit **required proof for each admin-assigned unit** during onboarding.
- **Onboarding is not complete** (no full app access) until **all required profile fields and all per-unit proofs** are submitted.
- Proof is a **completion requirement**, not a separate **unit package admin approval** step.

### Application access (initial)

- **No** self-signup **Pending Approval** screen for admin-assigned initial units.
- Access follows **existing invitation + membership + completed onboarding** (including all per-unit proofs).

### Additional units (after onboarding)

- Further units use the **add-on unit registration request** workflow (admin approve/reject).
- Rejection of an add-on **does not** remove access or affect existing units.

---

## 6. Path B — Resident self-signup (initial units)

### Submitting units

- Resident may add **one or multiple units** during initial signup / profile completion in **this community**.
- Per unit: existing vs new unit rules, billing contact rules, and separate proof.

### Admin review

- First submission = **one package** with all units and proofs.
- Admin **approves or rejects the entire package in one action** (v1).
- On reject: one reason; resident may resubmit a new package.

### Login and Pending Approval

- Resident **may log in** while the initial package is pending.
- Resident **must see Pending Approval** and **must not** use the full application until the **initial unit package is approved**.
- **Initial approval controls application access** for self-signup.

---

## 7. Path C — Additional unit requests (after access granted)

For residents who already have **at least one approved or admin-assigned active unit** (Path A or B).

### Request

- From **My units** (or equivalent resident menu), request an **existing unit** or a **new unit**.
- Proof per unit required; request sent to admin for approve/reject.

### Access impact

- **Approve:** new unit association becomes active; billing rules apply per unit.
- **Reject:** resident **keeps full app access** from existing units only.
- Rejecting an add-on **must not** affect other units or billing contacts.

**Key rule:** Initial access comes from Path A or B; **add-on requests never revoke access**.

---

## 8. Resident UI — My units

Add a **My units** (or **Units**) entry to the resident sidebar (web and mobile; parity TBD in implementation plan).

Within **the resident’s community**, they can:

- View **all unit associations** and status (active, pending, rejected).
- See **unit count**.
- **Request another existing unit** or **request a new unit** (Path C).
- See proof submission status for admin-assigned units during onboarding.

**Note:** This initiative does **not** include listing or switching between multiple communities.

---

## 9. Bills and optional services

### Visibility

- Only the **billing contact** for a unit may **view that unit’s bills** and **purchase optional services** for that unit.
- Residents linked to a unit but **not** billing contact **must not** see that unit’s bills or service purchase flows (API + UI).

### Multiple units as billing contact

- Resident sees bills for **all units** where they are billing contact.
- Provide a **unit filter** (e.g. Unit 10 / Unit 11).
- **Each bill is paid separately**; v1 does **not** merge payments across units.

### Optional services

- Services available only for units where the user is billing contact.
- If billing contact on **more than one unit**, user **must select the unit** before subscribing.
- Subscription is **(service, unit)** per existing per-unit rules; same service may be subscribed separately for multiple units.

### Notifications

- Include **unit label** on bill and service notifications.

---

## 10. Admin experience (summary)

| Scenario | Expectation |
|----------|-------------|
| Invite / create resident with N units | Existing flows; multiple unit rows; no initial unit approval queue. |
| Self-signup initial package | One request, all units + proofs; **Approve all** / **Reject** (reason). |
| Add-on request | Approve/reject per request; no app lockout on reject. |
| Member detail | List units, billing contact per unit, proof status. |

Admin-invited initial units do **not** appear in the self-signup pending package queue.

---

## 11. Application access (summary)

| State | Log in? | Full app? |
|-------|---------|-----------|
| Self-signup, initial package pending | Yes | No — Pending Approval |
| Self-signup, initial package approved | Yes | Yes (if membership allows) |
| Admin-invited, onboarding incomplete (e.g. missing per-unit proof) | Yes | No — complete onboarding |
| Admin-invited, onboarding complete | Yes | Yes |
| Add-on unit pending | Yes | Yes |
| Add-on unit rejected | Yes | Yes |

Suspension/ban overrides the above.

---

## 12. Display defaults without primary unit (v1)

- Admin member list: show multiple units (truncated), **“N units”** badge, or similar.
- Bills/services: **unit filter**; optional “last selected unit” in client session.
- No `primary_unit` database field in v1.

---

## 13. Regression — unchanged behavior

Must continue to work as today:

- Billing contact on existing vs new unit at invite/assignment.
- Billing contact **transfer** (per unit).
- Per-unit **bills**, **payments**, and **property services**.
- **One seat per resident** on invite/approve.
- Admin invitation **lifecycle** (invitation sent, onboarding, active), extended for multiple unit rows only.

---

## 14. Open items for implementation design

1. Maximum units per resident per community (cap or unlimited).  
2. Admin editing assigned units after invite sent but before onboarding complete.  
3. Optional `X-Unit-Id` (or equivalent) for bill/service APIs.  
4. Migration from legacy `profiles.unit_number` to per-unit records.  
5. Exact labels: **My units** vs **Units** in navigation.

---

## 15. Decision log

| Topic | Decision |
|-------|----------|
| Scope | Multiple units in **one community** only |
| Multi-community | **Out of scope** for this initiative |
| One seat per person | Yes |
| Admin invite, multiple initial units | Yes; proof per unit at onboarding; no unit approval queue for those units |
| Self-signup initial | Pending Approval until whole package approved |
| Add-on units | Admin approval; reject does not affect access |
| Primary unit | Not in v1 |
| Non–billing-contact | No bills or optional services for that unit |
| Payments | Separate per bill; unit filter when billing contact on 2+ units |

---

*Implementation should not begin until explicitly requested by the product owner.*
