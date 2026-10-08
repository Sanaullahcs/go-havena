# Plaid Integration Map (US)

**Date:** 2026-10-07 · **Scope:** backend (Laravel), web dashboards (Next.js), mobile (Expo) · **Build:** local, not deployed.

## 1. What Plaid does in Havena

Plaid is used for **both** bank linking **and** money movement.

| Plaid product | Used for | Where |
|---|---|---|
| **Auth** (`/link/token/create` products `auth`, `/auth/get`) | Community and resident bank linking, account selection, ACH numbers (stored encrypted, community only) | `PlaidService`, `PlaidResidentService` |
| **Transfer** (`/transfer/authorization/create`, `/transfer/create`, `/transfer/get`, `/transfer/cancel`, `/transfer/refund/create`, `/transfer/event/sync`, `/transfer/migrate_account`) | Resident ACH **debit** into Havena's Plaid Ledger, then an ACH **credit** from the ledger to the community bank; cancel, refund, status | `PlaidAchService` |
| Item webhooks (`ITEM` / `ERROR`, `PENDING_EXPIRATION`, …) | Mark a connection "needs attention" | `PlaidService::handleWebhook` |
| Transfer webhook `TRANSFER_EVENTS_UPDATE` | Trigger `/transfer/event/sync` | `PlaidAchService::syncEvents` |

Resident Link tokens request `auth` + `transfer`; if Plaid rejects that product set the code falls back to `auth` only.

**Who moves money:** Plaid Transfer. There is no other processor for US payments. Stripe is used only for
community *subscription* billing; KuickPay is Pakistan-only. `PaymentRouting` gives a community exactly one rail
(KuickPay for PK, Plaid for eligible non-PK countries).

### Money flow (as implemented)

```
Resident bank ──ACH debit (WEB)──▶ Havena Plaid Ledger ──ACH credit (CCD)──▶ Community bank
                 /transfer/authorization/create (type=debit)        /transfer/authorization/create (type=credit)
                 /transfer/create                                   /transfer/create
```

The credit is sent **immediately after the debit is created**, before the debit settles. Verified in Plaid
Sandbox on 2026-10-07: the credit authorization was **declined for insufficient ledger balance** and a refund
was **rejected for insufficient available balance**. Plaid documents that debit funds are not available in the
ledger until `funds_available`, and that refunds come out of the ledger's available balance. See decision D-1
in `plaid-fixes-and-results.md`.

## 2. Accounts

| Owner | Table | Contents | Visible to client |
|---|---|---|---|
| Community (receiving/payout) | `community_plaid_connections` (unique `community_id`) | item id, encrypted access token, selected account id/name/type/mask, encrypted ACH account + routing, optional encrypted `transfer_access_token` (from `/transfer/migrate_account`), status, last webhook, **payments pause** fields | Institution, account name/type/mask, item id, status. Never tokens or numbers. |
| Resident (funding) | `resident_plaid_connections` (unique `user_id`+`community_id`) | same shape (no transfer token) | same |

Both models now declare tokens and ACH numbers in `$hidden`, so accidental serialization cannot leak them.

## 3. Routing a payment to the right community

1. Resident pays a **booking** (`bookings.user_id` must equal the caller) or a **shared amenity bill**
   (`amenity_resident_bills.user_id` must equal the caller).
2. `community_id` comes from the amenity of that charge, never from the request.
3. Amount comes from `bookings.booking_fee` or `amenity_resident_bills.amount`; currency is fixed `USD`.
4. The debit uses the resident's connection **for that community**; the credit uses that community's connection.
5. The transfer row stores source/destination institution + mask and (new) the destination connection id and item id.

Unit **service bills** (`unit_service_bills`) are **not** payable by Plaid; they use KuickPay (PK) or proof upload.

## 4. Routes

| Method & path | Who | Purpose |
|---|---|---|
| `POST /api/v1/plaid/link-token` | Community admin (role `admin`, not moderator) | Link token (`create` / `update`) |
| `POST /api/v1/plaid/exchange-token` | Community admin (role `admin`) | Exchange public token; `replace=true` to swap account; optional `reason` |
| `GET /api/v1/plaid/connection` | Community admin or moderator | Safe connection payload |
| `POST /api/v1/plaid/reconnect`, `/disconnect` | Community admin (role `admin`) | Update-mode completion / disconnect (`reason` optional) |
| `GET /api/v1/plaid/payments` | Community admin | Community's ACH ledger |
| `GET /api/v1/plaid/resident/capability`, `/connection`; `POST …/link-token`, `/exchange-token`, `/reconnect`, `/disconnect` | Resident | Resident bank linking + readiness |
| `POST /api/v1/bookings` (`payment_method=bank_ach`) | Resident | Book and pay |
| `POST /api/v1/plaid/payments/booking`, `/plaid/payments/shared-bill`, `POST /api/v1/amenities/{id}/bills/{bill}/pay-bank` | Resident | Pay an existing charge |
| `DELETE /api/v1/bookings/{id}`, `PATCH /api/v1/bookings/{id}/reject` | Resident / booking approver | Cancels → cancel-or-refund the ACH |
| `POST /api/v1/plaid/webhook` | Plaid (public) | Item + transfer webhooks; JWT verified when enabled |
| `GET /api/v1/admin/plaid/overview`, `/transfers`, `/transfers/{id}`, `/events` | **System admin** (new) | Health, readiness, search |
| `POST /api/v1/admin/plaid/transfers/{id}/refresh`, `/resolve-exception`, `/sync-events`; `PATCH /admin/plaid/communities/{id}/payments` | **System admin** (new) | Safe refresh, review note, sync, pause/resume |

## 5. Data model

`plaid_transfers` — one row per payment attempt. Key columns:

- `status` — **debit** lifecycle only: `authorizing → authorized → processing → posted → settled`, terminal `failed`, `cancelled`, `returned`. Legacy rows may contain `needs_payout` / `refunded`.
- `provider_status` (raw Plaid debit status, incl. `funds_available`), `credit_status` (payout leg), `authorization_decision` / `authorization_rationale`.
- `refund_status` (`pending`, `posted`, `settled`, `failed`, `cancelled`, `returned`), `refund_amount`, `refund_reason`, `refund_requested_by/at`, `refund_failure_message`, `refund_transfer_id`.
- `return_code` (e.g. `R01`), `returned_at`, `cancelled_at`.
- `exception_code` / `exception_message` / `exception_at` / `exception_resolved_at` — reconciliation queue.
- `last_event_id`, `last_synced_at`, `notified_status` (notification de-duplication).
- FKs: `community_id` **restrict on delete**, `user_id` **null on delete** (previously both cascaded).

`plaid_transfer_events` (new) — append-only copy of every `/transfer/event/sync` event, unique `event_id`; its
max is the sync cursor. Unmatched and ledger-sweep events are kept.

`bookings` / `amenity_resident_bills` — `payment_method=bank_ach`, `plaid_transfer_id`, `ach_status`.

### Provider → Havena status mapping

| Plaid transfer status / event | `plaid_transfers.status` | Booking `payment_verification_status` | Shared bill `status` |
|---|---|---|---|
| auth `approved`, create OK (`pending`) | `processing` | `pending` | `pending_verification` |
| auth OK, create **timed out / 5xx** | `authorized` + exception `outcome_unknown` | `pending` (kept) | `pending_verification` |
| `posted` | `posted` | `accepted` | `paid` |
| `settled`, `funds_available` | `settled` | `accepted` | `paid` |
| `failed` | `failed` | `rejected` | `unpaid` (only if this transfer is the payment on record) |
| `cancelled` | `cancelled` | `rejected` | `unpaid` (same rule) |
| `returned` (`R01`, `R02`, `R10`, …) | `returned` + `return_code` | `rejected` | `unpaid` (same rule) |
| auth `declined` (`NSF`, `RISK`, …) | `failed` | booking removed | `unpaid` |
| auth `user_action_required` | `failed`; resident connection → `needs_attention` | booking removed | `unpaid` |
| `refund.pending` / `refund.posted` | unchanged; `refund_status` set | `rejected`, `ach_status=refund_pending` | unchanged (no auto-reopen) |
| `refund.settled` | unchanged; `refund_status=settled` | `ach_status=refunded` | unchanged |
| `refund.failed` / `refund.returned` | unchanged; exception `refund_failed` | `ach_status=refund_failed` | unchanged |

Rules: unknown/empty statuses are ignored; a lower-progress status never overwrites a higher one; terminal
debit states are final; `returned` is accepted after `posted`/`settled`. A collection that lands on a charge already
covered another way is flagged `duplicate_collection` and does not change the charge.

## 6. Jobs, webhooks, config

| Item | Detail |
|---|---|
| `plaid:sync-events` | Every 5 min (`withoutOverlapping` + cache lock). Pages `/transfer/event/sync` from the stored cursor (500/page, ≤20 pages). |
| `plaid:reconcile` | Hourly. `/transfer/get` for unresolved debits/refunds not synced in 30 min (missed-webhook recovery). |
| `plaid:status` | Config/connectivity check (never prints secrets). |
| Webhook verification | `PLAID_VERIFY_WEBHOOKS` (default **on** when `PLAID_ENV=production`): ES256 only, key via `/webhook_verification_key/get` (cached 12 h), signature, `iat` ≤ 5 min, constant-time body SHA-256. |
| `PLAID_TRANSFER_ENABLED` | Global kill switch for **new** payments (webhooks/reconcile continue). Now enforced on initiation. |
| `PLAID_TRANSFER_SIMULATE` | Explicit test mode only; refused when `PLAID_ENV=production`. **No automatic fallback.** |
| `PLAID_ALLOW_SANDBOX_IN_PRODUCTION` | Required for any payment when `APP_ENV=production` and Plaid is not in production mode. |
| `PLAID_SUPPORTED_COUNTRY_CODES` | Default `US`; `PK` always excluded. A community with **no** country is treated as eligible (see D-6). |

## 7. Permissions and audit

- System admins cannot create link tokens or change a community's bank (unchanged); they get the new operations API.
- Community admins: link/replace/reconnect/disconnect require membership role `admin` (moderators: view only).
- Residents: only their own charges and their own connection; guests blocked.
- Audit (`activity_logs`): connect/replace/disconnect (with previous and new **mask**, reason, pending-payment count),
  ACH initiated/failed/cancelled/refund requested/refund failed/refund needs review, all System Admin actions,
  pause/resume with reason. Webhook outcomes go to `AuditEventLogger::webhook`.

## 8. Classification of operations

| Operation | Classification |
|---|---|
| Community / resident linking, update mode, replace, disconnect | Implemented and testable (two defects fixed) |
| Resident debit (booking, shared bill) | Implemented and testable (several defects fixed) |
| Community payout credit | **Implemented but blocked in practice**: needs ledger funds (D-1) |
| Cancellation of a pending debit | Implemented (new; was missing) |
| Full refund | Implemented; outcome tracked from Plaid (was marked complete immediately) |
| Partial / multiple partial refunds | **Required but missing** (Plaid supports `amount`; Havena only full) |
| Refund of a shared amenity bill | **Required but missing** (no product path; D-4) |
| ACH returns | Implemented (was effectively broken: events never applied) |
| Disputes / unauthorized-debit claims (R05/R07/R10 returns) | Returns handled; **no dispute workflow** in Havena |
| Reversal (credit leg recovery) | Flagged as exception only; **no automated recovery** (D-1) |
| `/transfer/return/recover`, Plaid Guarantee | Not used |
| Recurring authorization / mandate capture | **Required but missing** (D-3) |
| Fees / net settlement / sweeps | Ledger sweep events stored; **no fee accounting** |
| Unit service bills by Plaid | Not implemented (by design today) |
