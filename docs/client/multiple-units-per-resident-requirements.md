# Multiple Units per Resident — Finalized Requirements

**Status:** Approved for implementation planning  
**Last updated:** 2026-03-21  
**Scope:** One resident account, multiple unit associations within a community (and across communities via existing memberships).  
**Principle:** Extend current unit, billing contact, invitation, and payment behavior. Do not replace established billing contact, transfer, or per-unit billing rules.

---

## 1. Goals and non-goals

### Goals

- Allow a **single resident** (one Havena user) to be linked to **multiple units** in the same community.
- Allow the same person to belong to **multiple communities** using existing **community membership** rules (unchanged conceptually).
- Keep **one seat / one resident count** per person per community regardless of unit count.
- Keep **bills and optional services per unit**, with billing contact determining who can view and pay.
- Support **admin-invited** and **self-signup** paths with clear, different approval rules for **initial** unit assignment.

### Non-goals (v1)

- **Primary unit** field (may be added later if needed for defaults).
- **Partial approve** of a self-signup initial package (approve Unit A, reject Unit B in one submission).
- **Combined payments** across units in a single checkout.
- Changing existing **billing contact transfer** lifecycle (extend only: one transfer per unit).
- Changing **seat billing** to count units instead of people.

---

## 2. Core concepts

| Concept | Meaning |
|--------|---------|
| **User** | One login (email/phone). |
| **Community membership** | One row per user per community; controls community access and resident seat counting. |
| **Unit** | Physical/apartment record in a community (`units`). |
| **Unit association** | Link between user and unit (`unit_residents`); status includes pending, approved/active, rejected, left. |
| **Billing contact** | Per **unit** (`units.billing_contact_user_id`); controls bills and optional services for that unit only. |
| **Unit registration request** | Admin-reviewed package for **self-signup initial** units and **all add-on** unit requests. **Not** used for admin-invited initial assignments. |

### Resident counting and seats

- A person with three units in one community counts as **one resident** and consumes **one seat** for that community.
- Pending add-on unit requests do **not** consume additional seats.
- Operational metrics may track **occupied units** separately from **resident headcount**.

---

## 3. Unit assignment rules (all paths)

When associating a resident with a unit:

### Select an existing unit

- The **billing contact remains unchanged** (existing system behavior).
- The resident may become a **unit resident** without becoming billing contact.

### Create / add a new unit

- The resident who creates or is assigned the new unit (per flow rules) becomes the **billing contact** for that new unit (existing system behavior).

### Billing contact transfers

- Billing contact is managed **per unit**, independently.
- A resident who is billing contact for Unit 10 and Unit 11 may initiate a **separate transfer request for each unit**.
- Existing transfer request workflows (initiate, accept/decline, admin rules) remain unchanged.

---

## 4. Proof documents

### Per unit

For each unit association that requires proof, the resident must provide **separately**:

1. **Utility bill** (or equivalent accepted document), and  
2. **Ownership or tenancy proof**, according to whether they declare **homeowner** or **tenant** for that unit.

Two units ⇒ two utility proofs and two role proofs (four uploads minimum), stored **per unit**, not only on the global profile.

### Validation

- Same file types, size limits, and role rules for admin-invited and self-signup paths.
- Documents are linked to **`(user_id, unit_id, document_type)`** (conceptually; exact schema TBD in design).

---

## 5. Path A — Admin-invited residents (System Admin or Community Admin)

### Invitation and initial units

- Admins may assign **one or more units** when inviting or creating a resident (existing unit and/or new unit per row).
- **Existing invitation workflow remains unchanged** at a high level: invite code, invitation sent, onboarding, membership rules, one seat, no new “unit approval queue” step for these initial assignments.
- Initial unit associations are established under **existing invitation/membership events** and are treated as **administratively approved** (active unit links per current rules), **without** a separate **unit registration request** for those units.

### Billing contact (initial units)

- **Existing unit:** billing contact unchanged.  
- **New unit:** invited resident becomes billing contact for that new unit.

### Proof during profile completion

- The resident **must** submit required proof **for each admin-assigned unit** during profile completion / onboarding.
- Each unit’s proof is submitted separately.
- **Onboarding is not complete** (and full application access must not be granted) until **all required profile fields and all per-unit proofs** for assigned units are submitted—aligned with extending today’s single-unit onboarding requirement, not a new admin approval step.

### Application access (initial)

- **No** self-signup **Pending Approval** screen for **admin-assigned initial units**.
- Access follows **existing invitation + membership + completed onboarding** rules (including all per-unit proofs).
- Proof is a **completion requirement**, not a **unit package admin approval** workflow.

### Additional units after onboarding

- Any **further** unit (existing or new) requested by the resident uses the **add-on unit registration request** workflow (admin approve/reject).
- Rejection of an add-on request **does not** remove access or affect previously assigned/approved units.

---

## 6. Path B — Resident self-signup (initial units)

### Submitting units

- Resident may add **one or multiple units** during signup / initial profile completion.
- Same **existing vs new unit** and **billing contact** rules apply per unit row.
- Separate proof per unit (utility + ownership/tenancy).

### Admin review

- All units in the **first submission** form **one package**.
- Admin reviews **one request** containing all units and proofs.
- Admin **approves or rejects the entire package in a single action** (v1).
- On **reject:** one reason; resident may **resubmit** a new package; still no full app until an initial package is approved.

### Login and Pending Approval

- Resident **may log in** while the initial package is pending.
- Resident **must see a Pending Approval experience** and **must not** access the full application until the **initial unit package is approved**.
- **Initial approval controls application access** for self-signup users.

---

## 7. Path C — Additional unit requests (after access granted)

Applies to residents who already have **at least one approved or admin-assigned active unit** in the community (from Path A or B).

### Request

- Resident uses **Communities & Units** (see §8) to request association with an **existing unit** or a **new unit**.
- Proof per unit is required as part of the request (same document rules).
- Request goes to admin for **approve or reject** (existing unit approval workflow extended for multi-unit).

### Access impact

- **Approval:** new unit association becomes active; billing rules apply per unit.
- **Rejection:** resident **retains full application access** based on **previously approved/assigned units** only.
- Rejecting an add-on **must not** affect existing unit associations or billing contacts on other units.

**Key rule:** Initial approval (Path B) or completed admin invite onboarding (Path A) grants access; **add-on requests never revoke access**.

---

## 8. Communities & Units (resident UI)

Add a **Communities & Units** item to the resident sidebar (web and mobile—parity target TBD in implementation plan).

Residents can:

- View **all unit associations** and which **community** each belongs to.
- See **how many units** they have (overall and per community).
- **Request an additional existing unit** or **request a new unit** (Path C).
- See status: active, pending, rejected (and admin-assigned units with proof status where applicable).

Cross-community: list is grouped by community; unit actions are scoped to the relevant community.

---

## 9. Bills and optional services

### Visibility

- Only the **billing contact** for a unit may **view that unit’s bills** and **purchase optional services** for that unit.
- Non–billing-contact unit residents **must not** see that unit’s bills or service purchase flows (enforce on API and UI).

### Multiple billing-contact units

- If the resident is billing contact for more than one unit, they see bills for **all such units**.
- Provide a **unit filter** (e.g. Unit 10 / Unit 11) to view bills for one unit at a time.
- **Each bill is paid separately**; v1 does **not** combine payments across units.

### Optional services

- Optional services entry is available only for units where the user is billing contact.
- If billing contact on multiple units, user **must select the unit** before subscribing.
- Subscription is tied to **(service, unit)** per existing per-unit service rules.
- The same service may be subscribed separately for multiple units.

### Notifications

- Bill and service notifications should include **unit identification** (e.g. unit number/label).

---

## 10. Admin experience (summary)

| Scenario | Admin UI expectation |
|----------|----------------------|
| Invite / create resident with N units | Existing invite/create flows; multiple unit rows; no new initial unit approval queue. |
| Self-signup initial package | Single **unit registration request** with all units + proofs; **Approve all** / **Reject** (reason). |
| Add-on request | Per-request approve/reject; does not appear as “initial signup” gate. |
| Member detail | List units, billing contact per unit, proof status; actions consistent with today’s member management. |

Invited residents’ initial admin-assigned units **do not** appear in the self-signup pending package queue; proof status may show on the member record.

---

## 11. Application access rules (summary)

| Resident state | Log in? | Full app? |
|----------------|---------|-----------|
| Self-signup, initial package pending | Yes | No — Pending Approval |
| Self-signup, initial package approved | Yes | Yes (subject to membership/suspension rules) |
| Admin-invited, onboarding incomplete (e.g. missing per-unit proof) | Yes | No — complete onboarding (existing + multi-unit proofs) |
| Admin-invited, onboarding complete | Yes | Yes |
| Add-on unit pending | Yes | Yes (unchanged) |
| Add-on unit rejected | Yes | Yes (unchanged) |

Access is **per community** where multi-community applies: approval/onboarding in Community X does not unlock Community Y.

Account-level **suspended/banned** rules override the above.

---

## 12. Display defaults without “primary unit” (v1)

- Member lists: show **multiple units** (truncated), **“N units”** badge, or first approved unit—product choice during design; no `primary_unit` column in v1.
- Bill/service UIs: **unit filter** with optional “last selected unit” in client session.
- Directory/search: one person per community; unit display may list all active units or summary text.

---

## 13. Regression and unchanged behavior

The following **must continue to work as today** (QA regression checklist):

- Billing contact on **existing vs new** unit at invite/assignment.
- Billing contact **transfer** (per unit).
- Per-unit **bill generation** and **payment** flows.
- **Seat reservation / resident invite** counting (one per person).
- System Admin and Community Admin **invitation lifecycle** (invitation sent, onboarding, active)—extended for multiple unit rows, not replaced.
- **KuickPay / property services** per-unit semantics where applicable.

---

## 14. Open items for implementation design (not blocking this document)

1. Maximum units per resident per community (cap or unlimited).  
2. Admin amend of assigned units after invite sent but before onboarding complete.  
3. Exact API headers (`X-Community-Id`, optional `X-Unit-Id`) for bill/service endpoints.  
4. Migration: backfill `unit_residents` from legacy `profiles.unit_number` where needed.  
5. Resident proof retention and admin download/compliance tooling.

---

## 15. Decision log (reference)

| Topic | Decision |
|-------|----------|
| Multi-community | Existing membership model; Communities & Units surfaces all. |
| One seat per person | Yes, regardless of unit count. |
| Admin invite multiple initial units | Yes; no unit registration approval for those units. |
| Admin invite proof | Required per unit at onboarding; not admin package approval. |
| Self-signup initial | Pending Approval until package approved; approve/reject whole package. |
| Add-on units | Admin approval; reject does not affect access or existing units. |
| Primary unit | Not in v1. |
| Non–billing-contact | No bills or optional services for that unit. |
| Payments | Separate per bill; unit filter for viewing. |

---

*This document consolidates product decisions from the Havena multiple-units discussion. Implementation should not begin until explicitly requested by the product owner.*
