# Services & Amenities Billing — Use Cases

**Go Havena Platform**  
Product specification for community administrators and development

| Field | Detail |
|---|---|
| Document owner | Havena |
| Audience | Community administrators, product & engineering |
| Version | 1.0 |
| Effective date | 16 September 2026 |
| Classification | Internal / client reference |
| Support | hello@gohavena.com |

---

## Contents

1. Purpose and core principles  
2. Services overview  
3. Service creation form  
4. Automatic services — flow  
5. Optional services — flow  
6. Amenities overview  
7. Amenity billing models  
8. Amenity use-case examples  
9. Payment proof and admin review  
10. Unit billing contact  
11. Side-by-side comparison  
12. Resident and admin screens  
13. Data model summary  

---

## 1. Purpose and core principles

Go Havena separates **Services** and **Amenities** because they bill different entities:

| Concept | Billed to | Who pays | Who is notified |
|---------|-----------|----------|-----------------|
| **Services** | **Unit** (`unit_id`) | Unit billing contact | **One** resident per unit (billing contact) |
| **Amenities** | **Resident** (`user_id`) | Each resident individually | **Each** resident who owes a bill |

### Mental model

- **Services** = obligations for the apartment (water, waste, building internet, assigned parking for the unit).
- **Amenities** = shared facilities used by people (pool, gym, meeting room, playground).

All services are created by the **Community Admin**. Residents do not create services; they may subscribe to optional services or pay bills issued to their unit.

---

## 2. Services overview

There are two service types:

| Type | Applies to | Billing starts | Example |
|------|------------|------------------|---------|
| **Automatic** | All eligible units in the community | Next billing cycle after publish | Water, gas, waste |
| **Optional** | Units that opt in / subscribe | After subscription is active | Extra parking, premium security |

### Service bill lifecycle (both types)

```
Bill issued → Notice + notification → Acknowledgement (optional)
→ Payment proof uploaded → Admin review → Paid or Rejected
→ If rejected: resident resubmits proof
```

---

## 3. Service creation form

Recommended as a **4-step wizard** for Community Admins.

### Step 1 — Basic details

| Field | Type | Notes |
|-------|------|-------|
| Service name | Text | e.g. Water, Assigned parking |
| Category | Select | Utilities / Maintenance / Security / Other |
| Description | Textarea | What the service covers |
| Icon | Select | For mobile and web lists |
| Status | Active / Inactive | Inactive = no new bills or subscriptions |

### Step 2 — Service type

| Field | Type | Options |
|-------|------|---------|
| **Application type** | Radio | **Automatic (all units)** · **Optional (resident opt-in)** |

#### If Automatic (all units)

| Field | Notes |
|-------|-------|
| Applies to | All active units in community |
| Billing frequency | Monthly (v1) |
| Amount type | Fixed per unit · Variable per unit (admin enters each month) |
| Default amount | Used when fixed |
| Due day | 1–31 |
| First billing month | When first bill run occurs |
| Payment instructions | Bank details, reference format, office hours |
| Require payment proof | Recommended: On |
| Auto-generate monthly bills | Cron or manual “Generate bills” |

#### If Optional (resident opt-in)

| Field | Notes |
|-------|-------|
| Subscription scope | **Per unit** (recommended) |
| Requires admin approval | On = request → approve; Off = instant subscribe |
| Billing frequency | Monthly · One-time |
| Amount | Monthly or one-time fee |
| Due day | For recurring optional services |
| Max subscribers | Optional cap (e.g. 50 parking spots) |
| Payment instructions | Same as automatic |
| Require payment proof | On |

**Recommendation:** Only the **unit billing contact** may subscribe or unsubscribe for optional services.

### Step 3 — Notice and communication

| Field | Notes |
|-------|-------|
| Notice template title | e.g. March Water Bill — Unit {{unit}} |
| Notice body | Invoice summary, due date, payment steps |
| Send as notice | Creates community notice to billing contact |
| Send push notification | On |
| Require acknowledgement | Resident confirms they have read the bill |
| Attach invoice PDF | Optional template; generated per bill |

### Step 4 — Review and publish

Summary of type, pricing, billing rules, and notification recipient (billing contact per unit).

---

## 4. Automatic services — flow

```
Admin creates service (Automatic)
        ↓
Service saved → applies to ALL active units
        ↓
Each month (cron or admin “Generate bills”):
  FOR each eligible unit:
    create unit_service_bill (unit_id, amount, due_date)
    resolve billing_contact_user_id for that unit
        ↓
    IF billing contact exists:
      send push notification (one resident)
      publish notice with invoice + payment instructions
      optional: require acknowledgement
    ELSE:
      alert admin: “Unit 4B has no billing contact”
        ↓
Billing contact opens notice / Services → Unit bills
        ↓
Resident acknowledges (if required)
        ↓
Resident uploads payment proof + date + reference
        ↓
Status → pending_verification
        ↓
Admin reviews in Service Bills inbox
        ↓
Approve → paid (+ confirmation notice)
Reject  → rejected (+ reason; resident may resubmit)
        ↓
Next month: new bill for same unit (same contact notified)
```

### Bill statuses

| Status | Meaning |
|--------|---------|
| unpaid | Bill issued, no proof |
| acknowledged | Resident read notice |
| pending_verification | Proof uploaded |
| paid | Admin approved |
| rejected | Admin rejected with reason |
| overdue | Past due, still unpaid |

---

## 5. Optional services — flow

Optional services use **per-unit subscription**. Billing after activation follows the same pipeline as automatic services.

### Phase 1 — Admin creates optional service

Admin publishes service with optional type, price, and whether approval is required. Service appears in the resident **Available services** catalog.

### Phase 2 — Resident discovers and requests

```
Billing contact opens Services catalog
        ↓
Sees optional service → “Subscribe for my unit”
        ↓
IF requires admin approval:
  Submit request (unit_id, optional note) → pending
  Admin approves or rejects
  IF approved → subscription active for unit_id
ELSE (instant subscribe):
  subscription active immediately
        ↓
Billing starts next cycle (or immediately for one-time)
```

Other unit residents see: *“Ask your unit billing contact to subscribe.”*

### Phase 3 — Billing (subscribed units only)

Each billing cycle, only units with an active subscription receive a `unit_service_bill`. Notification, notice, acknowledgement, and payment proof flow match automatic services.

### Phase 4 — Unsubscribe (optional)

Billing contact may cancel at end of current period or immediately (configurable). No new bills after end date.

---

## 6. Amenities overview

Amenities are **always resident-based**. Unit infrastructure (`units`, `billing_contact_user_id`) does **not** apply to amenity billing.

Each amenity is configured independently when the admin creates or edits it. An amenity uses **one primary charge model** (or free).

---

## 7. Amenity billing models

| Model | When charged | Who pays | Admin configuration |
|-------|--------------|----------|---------------------|
| **Shared monthly billing** | Every month | Each approved resident | Shared billing **On**, amount per resident, due day |
| **Booking / reservation fee** | At booking time | Resident who booked | Shared billing **Off**, bookable + slots, booking fee > 0 |
| **Free** | Never | — | Shared billing **Off**, booking fee = 0 |

Booking fee and shared monthly billing are **separate fields**. In most cases use one or the other, not both.

### Shared monthly billing flow

```
Admin enables shared billing on amenity
        ↓
Each month admin publishes monthly bill
        ↓
System creates one amenity_resident_bill per approved resident
        ↓
Each resident receives their own notification
        ↓
Each resident uploads their own payment proof
        ↓
Admin approves or rejects per resident
        ↓
Unpaid bills may block that resident from booking the amenity
```

### Per-booking fee flow

```
Resident selects date and available slot → books
        ↓
If booking fee > 0 → payment proof required at booking
        ↓
Admin approves booking and verifies payment
        ↓
No monthly bill for this amenity
```

### Free amenity

No shared billing, booking fee = 0. Residents use freely. Prefer **open** availability when slots are not needed.

---

## 8. Amenity use-case examples

| Amenity | Billing model | Admin settings | Resident experience |
|---------|---------------|----------------|---------------------|
| **Pool** | Monthly subscription | Shared billing **On** · amount per resident · due day · booking fee **$0** | Each resident gets a monthly bill; pays with proof; admin verifies |
| **Meeting Room** | Pay per booking | Shared billing **Off** · status **Bookable** · time slots · booking fee **> $0** | Pick slot → book → pay and upload proof at booking |
| **Playground** | Free | Shared billing **Off** · booking fee **$0** · status **Open** | Walk in and use — no bill, no payment |

### Pool (monthly subscription)

- Monthly fee is **membership/upkeep**, shared by all approved residents.
- Pool may still use bookable slots for capacity; monthly fee is not replaced by a per-booking charge unless explicitly configured.

### Meeting Room (pay per booking)

- Residents pay only when they reserve a slot.
- Payment proof is collected at booking time.
- Admin confirms payment before or as part of booking approval.

### Playground (free)

- No billing workflow.
- Typically **open** availability rather than slot-based booking.

---

## 9. Payment proof and admin review

Both services and amenities use the same proof workflow; only the **billing entity** differs.

| Step | Services (unit) | Amenities (resident) |
|------|-----------------|----------------------|
| Bill created | `unit_service_bills` | `amenity_resident_bills` |
| Notice audience | Billing contact | Billed resident |
| Acknowledgement | Billing contact | Resident |
| Upload proof | Billing contact | Resident |
| Admin review | Service Bills inbox | Amenity Bills inbox |
| Approve | Status → paid | Status → paid |
| Reject | Reason shown; resubmit allowed | Reason shown; resubmit allowed |

### Rejection reasons (standard set)

- Payment proof is unclear  
- Amount does not match  
- Incorrect bill / payment  
- Invalid receipt  
- Other (with note)

---

## 10. Unit billing contact

Required for **services only**.

| Rule | Detail |
|------|--------|
| One billing contact per unit | Stored on `units.billing_contact_user_id` |
| First resident on a unit | Becomes billing contact automatically |
| Additional residents | Join unit; do not become billing contact unless transferred |
| Transfer | Via profile settings or admin Units UI |
| Missing contact | Service bill created; admin alerted; no resident notification until contact assigned |

**Amenities ignore billing contact.** Each resident receives and pays their own amenity bills.

### Example: Unit 4B with Ahmed (billing contact) and Maria

| Charge | Billed to | Notified | Pays |
|--------|-----------|----------|------|
| Water (automatic service) | Unit 4B | Ahmed | Ahmed |
| Optional parking (subscribed) | Unit 4B | Ahmed | Ahmed |
| Pool monthly fee | Ahmed individually | Ahmed | Ahmed |
| Pool monthly fee | Maria individually | Maria | Maria |
| Meeting room booking | Whoever booked | That person | That person |

---

## 11. Side-by-side comparison

| | **Services** | **Amenities** |
|--|--------------|---------------|
| Created by | Community Admin | Community Admin |
| Bill target | Unit | Resident |
| Automatic vs optional | Automatic (all units) or Optional (subscribe) | Monthly, per booking, or free (per amenity) |
| Who gets monthly bill | Billing contact (one per unit) | Each resident separately |
| Who can subscribe (optional) | Billing contact | N/A — amenities use booking or auto monthly |
| Payment proof | Billing contact | Each resident |
| Examples | Water, waste, unit parking | Pool, meeting room, playground |

---

## 12. Resident and admin screens

### Resident (mobile / web)

**Services**

- My unit bills (billing contact only)  
- Available services (optional catalog)  
- Subscribe / request subscription  
- Bill history for unit  

**Amenities**

- Browse facilities  
- My amenity bills (personal)  
- Book slots (if bookable)  
- My bookings  

**Finance hub (optional unified view)**

- Unit bills — services, billing contact only  
- My amenity bills — always personal  
- My booking payments  

### Admin (web portal)

**Services**

- Create / edit services (automatic vs optional)  
- Generate monthly bills  
- Review unit service payment proofs  
- Manage unit billing contacts  

**Amenities**

- Create / edit amenities (shared billing, booking fee, slots)  
- Publish monthly amenity bills  
- Review amenity payment proofs (per resident)  
- Review booking payments  

Keep **three separate review queues**: Service bills · Amenity bills · Booking payments.

---

## 13. Data model summary

| Table | Purpose |
|-------|---------|
| `property_services` | Admin-created service; type automatic/optional; pricing rules |
| `units` | Unit record + `billing_contact_user_id` |
| `unit_residents` | Residents linked to units |
| `unit_service_subscriptions` | Optional services: unit_id, service_id, status, dates |
| `unit_service_bills` | One bill per unit per service per period |
| `amenities` | Facility config: shared billing, booking fee, slots |
| `amenity_monthly_bills` | Admin-published monthly batch for an amenity |
| `amenity_resident_bills` | One bill per resident per monthly batch |
| `bookings` | Reservations with optional booking fee and payment proof |
| `notices` | Finance notices linked to bills |

---

## Document history

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 16 September 2026 | Initial specification: services (automatic/optional), amenities (monthly/booking/free), billing contact rules |

---

*Havena · Services & Amenities Billing Use Cases · Version 1.0*
