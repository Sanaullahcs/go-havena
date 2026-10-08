# Plaid (US) — Use Cases

**Date:** 2026-10-07 · Status per use case: **Impl** (implemented, tested), **Fixed** (was defective, fixed this pass),
**Missing** (required, not implemented), **Unsupported** (provider/product), **Blocked** (credentials/business decision).
Test ids refer to `plaid-test-cases.md`. Decisions (D-x) are in `plaid-fixes-and-results.md`.

Each use case lists: actor · preconditions/permissions · flow · expected UI/API/DB/financial outcome · alternate/failure
flows · notifications & audit · acceptance criteria · tests.

---

## A. System Admin setup and operational controls

### UC-A01 Global enable/disable of US bank payments — **Fixed**
- **Actor:** platform operator (server config). **Pre:** shell access to `backend/.env`.
- **Flow:** set `PLAID_TRANSFER_ENABLED=false`, clear config cache.
- **Outcome:** new initiations return `422 PLAID_PAYMENTS_UNAVAILABLE` (`meta.reason=disabled_globally`); capability
  `can_pay_with_bank=false`; webhooks, event sync and reconcile continue. No DB change to existing payments.
- **Failure:** before this pass the flag only changed the capability payload — initiation ignored it.
- **Audit:** config change is out-of-app (no in-app toggle by design; D-7).
- **Accept:** no Plaid call is made while disabled. **Tests:** TC-E07.

### UC-A02 Pause / resume a community — **Impl (new)**
- **Actor:** System Admin. **Pre:** community has a bank connection row.
- **Flow:** *US Bank Payments* → Communities → Pause → reason (≥5 chars) → Confirm.
  `PATCH /admin/plaid/communities/{id}/payments {enabled:false, reason}`.
- **Outcome:** `payments_paused_at/by/reason` set; readiness `paused`; residents see bank payment unavailable; existing
  transfers keep updating from events/reconcile. Resume clears the fields.
- **Failure:** no reason → 422; no bank row → 422.
- **Audit:** `plaid_admin_payments_paused` / `_resumed` with reason. **Accept:** paused community cannot start a debit;
  its pending debit still settles. **Tests:** TC-E08, TC-I03.

### UC-A03 Country/currency restriction — **Impl**
- Plaid offered only where `PlaidEligibilityService` passes: country in `PLAID_SUPPORTED_COUNTRY_CODES`, never `PK`,
  billing-exempt excluded. Currency fixed USD server-side. Community with no country = eligible (D-6).
- **Tests:** existing `PlaidLifecycleTest::pakistan_community_cannot_access_plaid_apis`, `PlaidEligibilityServiceTest`.

### UC-A04 Show sandbox/production mode — **Fixed**
- Overview badge (Production / Plaid sandbox / Simulated), Community Admin page badge and copy now follow
  `environment`; previously copy always said "Sandbox" and claimed "Havena never takes the funds". **Tests:** TC-I02 (API); UI manual M-3.

### UC-A05 Config validation without secrets — **Impl (new)**
- `GET /admin/plaid/overview` → `client_id_set`, `secret_set`, `configured`, `webhook_url_set`, `verify_webhooks`,
  `transfers_enabled`, `simulated`, `sandbox_blocked_in_production`. Values never returned. **Tests:** TC-I02.

### UC-A06 Provider & webhook health — **Impl (new)**
- Last webhook received/processed/failed, last event sync, cursor, unmatched events. **Tests:** TC-I02, TC-F06. Manual M-4.

### UC-A07 Community onboarding / eligibility / readiness — **Impl (new)**
- Overview per community: country, eligible, bank status (institution + mask), paused, **ready** + reason
  (`not_eligible`, `community_inactive`, `not_configured`, `disabled_globally`, `sandbox_in_production`, `paused`,
  `community_bank_missing`, `community_bank_needs_attention`).
- "Bank connected" ≠ "ready": readiness also needs server config, active community, not paused.
- **Missing:** an explicit "System Admin approved this payout account" step (D-2). **Tests:** TC-I02, TC-I03.

### UC-A08 Restrict who may connect/replace payout account — **Fixed**
- Only membership role `admin` (or approved community_admin whose membership isn't `moderator`). Moderators: read only.
  System admins cannot link. **Tests:** TC-B03, existing `PlaidLinkTokenTest::system_admin_cannot_create_link_token`.

### UC-A09 Account-change audit — **Fixed**
- Connect/replace/disconnect log actor, timestamp, previous + new mask, institution, optional reason, pending-payment
  count. Never tokens or full numbers. **Missing:** reason is optional in API and not prompted in UI (D-2). **Tests:** TC-B02.

### UC-A10 Replacement while transactions pending — **Fixed**
- Existing pending debits/credits continue at Plaid to the accounts they were created with (recorded mask). New payouts
  use the new account. Stale `transfer_access_token` cleared (was a wrong-recipient risk). Pending count audited.
- **Tests:** TC-B02.

### UC-A11 Refund/cancel permissions — **Impl / Blocked**
- Refunds/cancels happen only through existing product flows: resident cancels a reservation, booking approver
  declines. No manual refund button (no approval policy defined; D-5). **Tests:** TC-G01..G05.

### UC-A12 Review failed, returned, duplicate, exception payments — **Impl (new)**
- Filters: pending, posted/settled, failed, returned, cancelled, refunds, needs review, stale. "Mark reviewed" requires
  a note and **does not change financial status**. Disputes have no separate type (returns R05/R07/R10 appear as
  returned). **Tests:** TC-I04, TC-I05.

### UC-A13 Transaction search — **Impl (new)**
- By community, resident (name/email), Plaid debit/credit/refund/authorization id, Havena id, payable type/id, date.
  **Tests:** TC-I05.

### UC-A14 Safe refresh and reconciliation — **Impl (new)**
- Refresh = `/transfer/get` (debit, payout, refunds); Sync = `/transfer/event/sync`. Neither can set an arbitrary status.
  **Tests:** TC-I04, TC-F08, TC-F01.

### UC-A15 No fictional financial edits — **Impl**
- There is no endpoint to set status, mark settled/refunded, or delete transfers. Community deletion is blocked when
  payment history exists; FKs no longer cascade. **Tests:** TC-I06, TC-I04.

### UC-A16 Limits / thresholds / two-person approval — **Blocked (D-5)**
- None exist. Plaid enforces its own authorization limits (decline rationale `TRANSFER_LIMIT_REACHED` is surfaced).
  Not invented here.

---

## B. Community bank linking

| ID | Use case | Flow & expected outcome | Failure / alternate | Status | Tests |
|---|---|---|---|---|---|
| UC-B01 | First connection | Link token → Plaid Link → exchange → `/auth/get` → row `connected` with mask; audit `plaid_bank_connected` | Exchange failure → 422, nothing saved | Impl | existing ExchangeToken tests |
| UC-B02 | Open page after connection | `GET /plaid/connection` safe payload, "Bank Account Connected" | — | Impl | existing Lifecycle tests |
| UC-B03 | Link cancelled / interrupted | Link `onExit` → toast, no API call | — | Impl (UI) | Manual M-1 |
| UC-B04 | Expired / invalid link or public token | `INVALID_PUBLIC_TOKEN`/`PUBLIC_TOKEN_EXPIRED` → clear message | — | Impl | existing |
| UC-B05 | Duplicate exchange | Second exchange without `replace` → 409 already connected | — | Impl | existing `duplicate_connection_is_rejected` |
| UC-B06 | Unsupported institution / account type | Link restricts to Auth-capable institutions; account selection prefers depository | Non-depository chosen → saved; payout would fail at Plaid | Impl / gap | Manual S-3 |
| UC-B07 | Multiple accounts | `account_id` from Link metadata must belong to the new item, else first depository | — | Impl | code review |
| UC-B08 | Verification pending (micro-deposits) | Not configured in Link | — | **Missing** (D-8) | — |
| UC-B09 | Update mode / re-auth | Item webhook → `needs_attention` → Reconnect (update mode) → `completeReconnect` | Still broken → 422 | Impl | existing |
| UC-B10 | Revoked / disconnected access | `USER_PERMISSION_REVOKED`, `ITEM_NOT_FOUND` → `error`; readiness `community_bank_needs_attention` | — | Impl | existing webhook test |
| UC-B11 | Institution outage | Plaid errors surface; no auto-retry of money movement | — | Impl | — |
| UC-B12 | Reconnect without corrupting history | Same row updated; transfers keep their own masks | — | Impl | existing |
| UC-B13 | Replace account | **Fixed:** exchange new token first, then remove old item; clear stale payout token; audit masks | Invalid new token → old bank stays connected (was destroyed before) | Fixed | TC-B01, TC-B02 |
| UC-B14 | Disconnect with pending transactions | Allowed; tokens cleared; pending count audited; refunds still possible per Plaid (account/routing still valid) | — | Impl | existing disconnect test |
| UC-B15 | Admin reassigned / suspended | Access derives from approved admin membership; suspended → middleware 403 | — | Impl | existing |
| UC-B16 | Unauthorized linking for another community | Community from caller's membership, never from input | — | Impl | existing `authenticated_user_and_community_mapping_is_used` |
| UC-B17 | No token/secret leakage | Payloads exclude tokens/numbers; `$hidden` added; exception `meta` filtered | — | Fixed | TC-I02, TC-I07, existing |

## C. Resident bank linking and authorization

| ID | Use case | Expected | Status | Tests |
|---|---|---|---|---|
| UC-C01 | Link resident account | Approved membership required; row per user+community | Impl | existing capability test |
| UC-C02 | Change funding account | `replace=true`; **Fixed** order (exchange first, remove old after) | Fixed | code review (same pattern as TC-B01) |
| UC-C03 | Verification requirements | Auth instant only; micro-deposits not configured | Missing (D-8) | — |
| UC-C04 | Capture payment authorization / mandate | **No consent text or mandate record.** Havena now records initiation IP, user agent, time and sends `user_present=true` + `device` to Plaid. That is evidence of initiation, **not** a Nacha WEB authorization. | **Missing (D-3)** | TC-E01 |
| UC-C05 | Declined / expired / revoked authorization | `declined` → failed with rationale; `user_action_required` → resident connection `needs_attention`, prompt reconnect | Fixed | TC-E02, TC-E04 |
| UC-C06 | Use another resident's funding account | Debit always uses caller's own connection for that community | Impl | TC-C01 |
| UC-C07 | Unlink with pending payments | Allowed; pending debit continues at Plaid; refunds still possible | Impl | — |
| UC-C08 | One-time vs recurring authorization | Only one-time, user-initiated debits exist | Missing (D-3) | — |
| UC-C09 | Revocation stops future debits | No recurring debits exist, so nothing to stop | N/A | — |

## D. Bills and payment eligibility

| ID | Use case | Expected | Status | Tests |
|---|---|---|---|---|
| UC-D01 | Pay valid unpaid charge | Shared bill `unpaid/rejected/overdue` or booking `pending/awaiting_payment/confirmed` | Impl | TC-E01 |
| UC-D02 | Paid / cancelled / inaccessible charge | Paid → 409; cancelled booking → 422 `PLAID_CHARGE_NOT_PAYABLE` (**Fixed**: was payable); other user's → not found | Fixed | TC-D01, TC-C01, existing |
| UC-D03 | Server-side amount & currency | Amount from DB, USD fixed, request cannot supply either | Impl | TC-E01 |
| UC-D04 | Rounding / min / max | 2-dp rounding; >0 required; no Havena max (Plaid limits) | Impl / D-5 | existing |
| UC-D05 | Amount changed after attempt starts | Transfer keeps the amount at initiation; bill marked paid on success regardless | **Gap (D-9)** | — |
| UC-D06 | Overdue bills / fees | Overdue payable; no late fees exist | Impl | — |
| UC-D07 | Several residents, one unit | Shared bills are per resident (`amenity_resident_bills.user_id`) | Impl | — |
| UC-D08 | Two payers at once | Row lock on the charge + in-flight check → 409 | Fixed | TC-E10 |
| UC-D09 | Move-out / reassignment privacy | Plaid charges are per-person; unit bills not payable by Plaid | Impl | — |
| UC-D10 | Automatic-billing rules (vacant units) | **Conflict:** current code and `KuickpayPaymentsReviewTest::a09` generate automatic service bills for vacant units. Not Plaid-payable. | **Decision (D-10)** | — |

## E. Payment initiation and processing

| ID | Use case | Expected | Status | Tests |
|---|---|---|---|---|
| UC-E01 | Successful initiation | auth (with `idempotency_key`) → create → `processing`; charge `pending`; no "paid" notification yet | Fixed | TC-E01, TC-E11 |
| UC-E02 | Authorization declined / NSF | Clear message, not charged, booking removed, attempt kept as `failed` | Fixed | TC-E02 |
| UC-E03 | Malformed authorization response | No decision → fail, not treated as approved (**was approved by default**) | Fixed | TC-E03 |
| UC-E04 | Invalid/closed account at create | Plaid 4xx → failed, code kept, no internal details exposed | Fixed | TC-I07 |
| UC-E05 | Missing capability / Plaid down | Fails; **no fake success** (was automatic simulated "posted") | Fixed | TC-E05 |
| UC-E06 | Duplicate taps / tabs | Lock + in-flight check; booking one-per-day rule; UI disables button | Fixed | TC-E10, TC-E06 |
| UC-E07 | Timeout after Plaid may have accepted | `authorized` + `outcome_unknown`; charge stays pending; retry blocked; admin investigates | Fixed | TC-E06 |
| UC-E08 | Rate limiting / 5xx | 4xx → failed; 5xx at create → outcome unknown | Fixed | TC-E06 |
| UC-E09 | App closed / logout / network loss | Server state is truth; return to screen shows current status | Impl | Manual M-6 |
| UC-E10 | Pending too long | Listed as **stale** (default 4 days, `PLAID_TRANSFER_STALE_MINUTES`); reconcile job re-reads | Impl | TC-F08 |
| UC-E11 | Multiple attempts on one charge | New attempt allowed only after previous is terminal; history kept | Impl | TC-F03 |
| UC-E12 | Correct routing | Community from charge; destination mask/item recorded | Impl | existing clubhouse test |
| UC-E13 | Payout leg fails | Debit kept; `payout_failed` exception (**was hidden in `needs_payout`**) | Fixed | TC-E12 |
| UC-E14 | Cut-offs / weekends / holidays | Havena does not compute dates; Plaid documents 8:30 PM ET standard ACH cutoff. "1–3 business days" copy removed | Impl | — |
| UC-E15 | APP_ENV=production with sandbox keys | Refused unless `PLAID_ALLOW_SANDBOX_IN_PRODUCTION=true` | Fixed | TC-E09 |

## F. Payment status and webhooks

| ID | Use case | Expected | Status | Tests |
|---|---|---|---|---|
| UC-F01 | Authenticated webhook | ES256 JWT verified, key cached, `iat` ≤5 min, body hash | Fixed (was: any non-empty header) | TC-F07 |
| UC-F02 | Invalid signature / stale / wrong alg / no header | 400, audit `invalid` | Fixed | TC-F07 |
| UC-F03 | `TRANSFER_EVENTS_UPDATE` | Sync from stored cursor (**was `after_id:0` and results discarded**) | Fixed | TC-F06, TC-F01 |
| UC-F04 | Duplicate / replayed events | Unique `event_id`; replay is a no-op | Fixed | TC-F01 |
| UC-F05 | Out-of-order / older events | Lower progress never overwrites; terminal final | Fixed | TC-F02 |
| UC-F06 | Unknown transfer/account | Stored `unmatched`; visible in overview | Fixed | TC-F04 |
| UC-F07 | Unexpected event types | `sweep.*` stored as `ledger`; `swept`, `adjustment` etc. recorded without state change | Impl | TC-F04 |
| UC-F08 | Webhook before initiation stored | Event stored `unmatched`; reconcile (`/transfer/get`) later applies truth | Impl (partial) | TC-F08 |
| UC-F09 | DB failure during processing | Per-event transaction; failure stops run; cursor not advanced; webhook 500 → Plaid retries | Impl | code review |
| UC-F10 | Reconcile and webhook together | Row lock in `applyDebitStatus`; cache lock on sync | Impl | code review |
| UC-F11 | Missed webhook | Hourly `plaid:reconcile` + 5-min sync | Fixed | TC-F08 |
| UC-F12 | `funds_available` | Treated as settled (was regressed to processing) | Fixed | TC-F05 |
| UC-F13 | Return after settled | Accepted; charge reopened if this transfer paid it | Fixed | TC-F03 |
| UC-F14 | Frontend cannot establish success | Only Plaid data changes status; booking accepted only at `posted` | Impl | TC-E11 |

## G. Cancellations, refunds, returns, disputes

Plaid meanings (Transfer docs, 2026-10-07):
- **Cancel** `/transfer/cancel`: allowed only while `/transfer/get` says `cancellable=true` (before submission). No money moves.
- **Refund** `/transfer/refund/create`: new credit to the original account; `transfer_id`, `amount`, required
  `idempotency_key`; transfer initiated within 180 days; paid from the ledger **available balance** (rejected if
  insufficient); no need to wait for settlement; statuses pending→posted→settled, or failed/cancelled/returned.
  Works even if the Item token is gone, if account+routing remain valid.
- **Return**: the receiving bank reverses the debit (`returned` with code, e.g. R01 NSF, R02 closed, R03/R04 invalid,
  R10/R05/R07 unauthorized). Not initiated by Havena.
- **Dispute**: a consumer unauthorized-debit claim arrives as a return; Havena has no separate dispute flow.

| ID | Scenario | Who | Eligible | Behaviour | Status | Tests |
|---|---|---|---|---|---|---|
| UC-G01 | Cancel before processing | Resident cancel / approver decline | debit `processing` + Plaid `cancellable` | `/transfer/cancel` debit, then payout if cancellable; else `payout_recovery_required` | Fixed (was: nothing happened, money kept) | TC-G01 |
| UC-G02 | Cancel after allowed stage | same | not cancellable | Falls through to refund if posted; else exception `refund_required` | Fixed | code path; S-4 |
| UC-G03 | Full refund | same | `posted/settled`, no refund yet | Refund **pending** until Plaid settles; charge stays cancelled; `payout_recovery_required` if payout already sent | Fixed (was: "refunded" instantly; sandbox faked it) | TC-G02 |
| UC-G04 | Partial / multiple partial | — | — | Not offered | Missing (D-4) | — |
| UC-G05 | Refund exceeding remaining | — | — | Only full amount, once | Impl | TC-G04 |
| UC-G06 | Duplicate / concurrent refund | — | — | Row lock + `canRefund`; one Plaid call; idempotency key `rf-{id}` | Fixed | TC-G04 |
| UC-G07 | Refund pending/failed/completed/returned | — | — | Tracked in `refund_status`; failed/returned → exception, resident not told "refunded" | Fixed | TC-G02, TC-G03, S-1 |
| UC-G08 | Refund to closed account | — | — | Arrives as `refund.returned` → exception | Impl | — |
| UC-G09 | ACH return after confirmation | Plaid | posted/settled | `returned`, code, bill reopened, notification once | Fixed | TC-F03, S-1 |
| UC-G10 | NSF / closed / invalid / unauthorized returns | Plaid | any | Same path; code recorded | Impl | TC-F03 (R01), TC-G05 (R10) |
| UC-G11 | Reversal of payout | — | — | Not automated; exception | Missing (D-1) | TC-F03 |
| UC-G12 | Duplicate collection | — | — | `duplicate_collection` exception; charge untouched | Fixed | TC-G06 |
| UC-G13 | Return while refund pending | — | — | `returned_while_refunded` exception (risk of double credit) | Fixed | TC-G05 |
| UC-G14 | Return then new payment | Resident | after return | New attempt allowed; history kept | Impl | TC-F03 |
| UC-G15 | Dispute / unauthorized claim | Resident via bank | — | Return R05/R07/R10 handled; no in-app dispute | Missing | — |
| UC-G16 | Refund/return after move-out or suspension | — | — | Allowed; community inactive only blocks new payments | Impl | — |

**When a balance is reopened:** only when the transfer that is the payment on record for the charge ends `failed`,
`cancelled` or `returned`. A refund never reopens a shared bill automatically. A return does not reopen a charge another
payment covers. Original payment rows are never deleted or overwritten.

## H. Reconciliation and records

| ID | Scenario | Behaviour | Status | Tests |
|---|---|---|---|---|
| UC-H01 | Plaid success, local update failed | Event retried from cursor; reconcile reads `/transfer/get` | Impl | TC-F08 |
| UC-H02 | Local pending, Plaid final | Reconcile/sync applies | Impl | TC-F08 |
| UC-H03 | Settled amount differs | Event `transfer_amount` stored; no automatic comparison | Missing | — |
| UC-H04 | Fees / net settlement | Not modelled | Missing | — |
| UC-H05 | Unmatched provider transfers | Stored, counted | Impl | TC-F04 |
| UC-H06 | Duplicate references / collections | Unique ids; duplicate collection flagged | Impl | TC-G06 |
| UC-H07 | Return/refund after earlier reconciliation | Event history immutable; status monotonic with returns allowed | Impl | TC-F03 |
| UC-H08 | Correct mappings | transfer → payable & community | Impl | TC-I05 |
| UC-H09 | Overlapping runs | `withoutOverlapping` + cache lock + unique event id | Impl | code review |
| UC-H10 | Manual investigation | Exceptions queue + review note | Impl | TC-I04 |

**Accounting model (actual):** no ledger/journal. Each `plaid_transfers` row is one collection attempt with separate
debit, payout and refund legs; the charge (`bookings`, `amenity_resident_bills`) points to the transfer that paid it.
"Collected" = debit `posted/settled` and no active refund. Attempts, collections, refunds and returns are traceable
per row and in `plaid_transfer_events`; they are not double counted because only the transfer on record changes the
charge.

## I. Security

| ID | Scenario | Status | Tests |
|---|---|---|---|
| UC-I01 | Role matrix (system admin / community admin / moderator / resident / guest / unauthenticated) | Impl | TC-I01, TC-B03, existing |
| UC-I02 | Cross-community / cross-resident / guessed ids | Impl | TC-C01, TC-I05 |
| UC-I03 | Amount/currency/status manipulation | Impl (no such inputs) | TC-E01 |
| UC-I04 | Replay | Webhook `iat`; unique events; idempotency keys | Fixed | TC-F07, TC-F01 |
| UC-I05 | Secret/bank detail leakage in API, logs, errors | Fixed (`$hidden`, filtered exception meta) | TC-I02, TC-I07 |
| UC-I06 | Session expiry mid-action | Sanctum 401; server state unchanged | Impl | — |
| UC-I07 | Admin endpoint protection | `system.admin` middleware; throttles on refresh/sync | Impl | TC-I01 |
| UC-I08 | Audit integrity / retention | Append-only by convention; retention policy not defined | Blocked | — |

## J. UI, notifications, regression

| ID | Scenario | Status | Tests |
|---|---|---|---|
| UC-J01 | Accurate labels (Processing, Awaiting confirmation, Posted, Settled, Returned (R01), Refund pending, Refunded, Refund failed) | Fixed | TC-F03, TC-G02 |
| UC-J02 | Loading / duplicate-submit prevention | Impl (existing buttons disabled) | Manual M-2 |
| UC-J03 | Notifications once per outcome | Fixed (`notified_status`) | TC-F01, TC-F03, TC-G02 |
| UC-J04 | Receipts | No receipt documents exist for Plaid payments | Missing |
| UC-J05 | Mobile/dashboard consistency | Same API; mobile hides bank pay when `ach_enabled=false` | Impl | Manual M-5 |
| UC-J06 | KuickPay & Stripe unaffected; PK never sees Plaid | Impl | KuickPay suites, eligibility tests |
| UC-J07 | No credential/status mixing | Separate tables, services, configs | Impl | code review |
