# Plaid (US) — Test Cases

**Date:** 2026-10-07 · Stack: PHPUnit 10 / Laravel feature tests on MySQL `havena_test`, `RefreshDatabase`.

Verification types: **Mock** = `Tests\Support\FakePlaidHttp` (recording fake of the Plaid HTTP API) or Mockery;
**Sandbox** = real Plaid Sandbox (`PlaidSandboxE2ETest`, opt-in `PLAID_SANDBOX_E2E=1`); **Manual** = UI walk-through;
**Blocked** = needs something not available locally.

Status values: **Pass** (executed and passed this pass), **Fail**, **Blocked**, **Not Run**.

## Fixtures

`PlaidTransferLifecycleTest::seedReadyBanks()` builds, per call, a fresh US community (unique region, active
subscription), an approved community admin (membership `admin`), a resident (membership `member`), a connected
community bank (mask 4321) and a connected resident bank (mask 9876). Tests combine several calls to get **multiple
communities**, add a **second resident** (`member()`), a **moderator**, a **system admin**, **pending**, **settled**,
**returned**, **refund-pending** and **duplicate** transfers (`transferRow()`), **account replacement**
(`transfer_access_token` pre-seeded) and **cancelled bookings**. Plaid behaviour is scripted per test (decline, NSF,
`user_action_required`, malformed, 4xx, 5xx/timeout) and an in-memory event stream drives `/transfer/event/sync`.
Occupied vs vacant **units** are not used: unit service bills are not Plaid-payable (see UC-D10).

## Matrix — new automated tests (`tests/Feature/PlaidTransferLifecycleTest.php`)

Common preconditions unless stated: live mode (`simulate=false`), `PLAID_ENV=sandbox`, `APP_ENV=testing`, ready banks.
Actor R = resident, CA = community admin, SA = system admin, P = Plaid (fake).

| Test ID | UC | Scenario | Pri | Actor | Preconditions / data | Steps / API | Expected UI/API/DB/financial | Actual | Status | Evidence | Fix |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-E01 | UC-E01, C04 | Idempotency keys on debit + credit authorizations only | P0 | R | bill $45 | `POST /plaid/payments/shared-bill` | 201 `processing`; both auth calls carry distinct ≤50-char `idempotency_key`, `user_present`; `/transfer/create` has none | as expected | Pass | run log `.tmp/plaid-new.txt` | F-02 |
| TC-E11 | UC-E01, F14 | Accepted debit is not "paid" | P0 | R | bill $30 | pay | bill `pending_verification`, `ach_status=processing`; no "Bank payment sent" | as expected (after test-data fix) | Pass | rerun 2/2 | F-01 |
| TC-E02 | UC-E02 | NSF decline | P0 | R | auth `declined/NSF` | `POST /bookings bank_ach` $25 | 422 NSF message; no booking; no `/transfer/create`; failed attempt kept | as expected | Pass | log | F-04 |
| TC-E03 | UC-E03 | Missing decision | P0 | R | auth without `decision` | pay bill | 422; no create; bill unpaid | as expected | Pass | log | F-04 |
| TC-E04 | UC-C05 | `user_action_required` | P1 | R | auth decision u_a_r | pay bill | 422 `PLAID_USER_ACTION_REQUIRED`; resident connection `needs_attention` | as expected | Pass | log | F-25 |
| TC-E05 | UC-E05 | Plaid unreachable in sandbox | P0 | R | SSL error, `simulate` unset | book $12 | 422; no booking; no simulated/posted row | as expected | Pass | log | F-03 |
| TC-E06 | UC-E07 | Timeout after authorization | P0 | R | `/transfer/create` cURL 28 | book $40, then retry `POST /plaid/payments/booking` | 201 booking kept `pending`; transfer `authorized` + `outcome_unknown`; retry 409; create called once | as expected | Pass | log | F-16, F-08 |
| TC-E07 | UC-A01 | Global kill switch | P0 | R | `PLAID_TRANSFER_ENABLED=false` | pay; capability | 422 `disabled_globally`; `can_pay_with_bank=false`; zero Plaid calls | as expected | Pass | log | F-10 |
| TC-E08 | UC-A02 | Paused community | P0 | R | pending debit, then pause | pay 2nd bill; sync `posted` | 422 `paused`; first bill → `paid` | as expected | Pass | log | new control |
| TC-E09 | UC-E15 | Sandbox on live app | P0 | R | `APP_ENV=production`, sandbox | pay; enable override; pay | 422 `sandbox_in_production`; 201 with override | as expected | Pass | log | F-22 |
| TC-E10 | UC-D08 | In-flight attempt | P0 | R | `authorizing` row exists | pay same bill | 409 in progress; no auth call | as expected | Pass | log | F-15 |
| TC-E12 | UC-E13 | Payout declined | P1 | R | credit auth declined | pay | debit kept; no credit id; `payout_failed` | as expected | Pass | log | F-17 |
| TC-D01 | UC-D02 | Cancelled booking via direct API | P1 | R | booking `cancelled` fee $30 | `POST /plaid/payments/booking` | 422 `PLAID_CHARGE_NOT_PAYABLE`; no Plaid call | as expected | Pass | log | F-21 |
| TC-C01 | UC-C06, I02 | Pay another resident's bill | P0 | 2nd R | bill owned by R1 | R2 pays R1 bill | 422 "Bill not found."; no Plaid call | as expected | Pass | log | — |
| TC-F01 | UC-F03, F04, J03 | Sync posted→settled; replay | P0 | P | debit-1 | sync twice | 3 then 0 events; 2nd cursor=3; `settled`; bill paid; one notification | as expected | Pass | log | F-01, F-19 |
| TC-F02 | UC-F05 | Out-of-order events | P0 | P | settled, posted, pending | sync | stays `settled`; 2 events `stale` | as expected | Pass | log | F-11 |
| TC-F03 | UC-G09, F13, G14 | Return after settlement | P0 | P | posted, settled, returned R01 | sync; pay again | `returned`, `R01`, label "Returned (R01)", `payout_recovery_required`; bill `unpaid`; one notification; new attempt allowed | as expected | Pass | log | F-01, F-18 |
| TC-F04 | UC-F06, F07 | Unknown transfer & sweep events | P1 | P | foreign id, `sweep.settled` | sync | stored `unmatched` / `ledger` | as expected | Pass | log | F-01 |
| TC-F05 | UC-F12 | `funds_available` | P1 | P | settled, funds_available | sync | `settled`, provider_status `funds_available` | as expected | Pass | log | F-11 |
| TC-F06 | UC-F03 | Webhook uses stored cursor | P0 | P | stored event 40 | `POST /plaid/webhook TRANSFER_EVENTS_UPDATE` | sync `after_id=40` | as expected | Pass | log | F-01 |
| TC-F07 | UC-F01, F02, I04 | JWT verification | P0 | P/attacker | EC P-256 key; verify on | valid; tampered body; iat −600 s; HS256; other key; no header | 200; 400 ×5 | as expected | Pass | log | F-09 |
| TC-F08 | UC-F11, H02 | Missed webhook | P0 | job | remote status `posted` | `plaid:reconcile` | `posted`; bill paid | as expected | Pass | log | F-01 |
| TC-G01 | UC-G01 | Cancel pending booking | P0 | R | booking $40 `processing` | `DELETE /bookings/{id}` | `/transfer/cancel` debit-1 & credit-2; `cancelled`; no refund; booking `rejected/cancelled` | as expected | Pass | log | F-06 |
| TC-G02 | UC-G03, G07 | Cancel posted booking | P0 | R, P | posted | DELETE; then `refund.settled` | refund call $40 with key; `refund_status=pending`, not refunded, label "Refund pending", `payout_recovery_required`, booking `refund_pending`; after event `refunded` + one notification | as expected | Pass | log | F-05, F-12 |
| TC-G03 | UC-G07 | Plaid rejects refund | P0 | R | refund 422 | DELETE | `refund_status=failed`, `refund_failed`, `refunded_at` null; booking `refund_failed` | as expected | Pass | log | F-05, F-27 |
| TC-G04 | UC-G05, G06 | Second refund | P0 | service | refund pending | `refund()` ×2 | 2nd throws; 1 Plaid call | as expected | Pass | log | F-05 |
| TC-G05 | UC-G13 | Return while refund pending | P0 | P | refund pending | `returned` R10 | `returned` + `returned_while_refunded` | as expected | Pass | log | F-12 |
| TC-G06 | UC-G12 | Paid elsewhere, ACH posts | P0 | P | bill set paid by proof | `posted` | bill unchanged; `duplicate_collection` | as expected | Pass | log | F-18 |
| TC-G07 | UC-G09 | Return on bill covered by another transfer | P0 | P | bill → other settled transfer | `returned` | bill stays paid | as expected | Pass | log | F-18 |
| TC-B01 | UC-B13 | Failed replace | P0 | CA | connected bank | exchange `replace` with bad token | 422; old bank connected; no item/remove | as expected | Pass | log | F-13 |
| TC-B02 | UC-A09, A10, B13 | Replace clears stale payout token | P0 | CA | `transfer_access_token` set | replace with reason | token cleared; mask 7777; old item removed after; audit has 4321, 7777, reason, no token | as expected | Pass | log | F-07 |
| TC-B03 | UC-A08 | Moderator | P0 | moderator | membership `moderator` | GET connection; link-token; exchange; disconnect | 200; 403 ×3; bank unchanged | as expected | Pass | log | F-14 |
| TC-I01 | UC-I07 | System Admin API roles | P0 | CA, R | — | overview/transfers/sync | 403 for CA and R | as expected | Pass | log | new |
| TC-I02 | UC-A05..A07, B17 | Overview without secrets | P0 | SA | ACH numbers stored | GET overview | config flags; community ready; no secret, client id, token, account or routing number in body | as expected | Pass | log | new, F-24 |
| TC-I03 | UC-A02 | Pause/resume needs reason, audited | P0 | SA, R | — | PATCH without/with reason; capability | 422; paused + audit; resident cannot pay; resume → can pay | as expected | Pass | log | new |
| TC-I04 | UC-A12, A14, A15 | Refresh & review note | P0 | SA | exception open | refresh; resolve without/with note | status unchanged; 422 without note; exception closed; audit | as expected (after test-data fix) | Pass | rerun 2/2 | new |
| TC-I05 | UC-A13 | Search/filter | P1 | SA | 2 communities | search debit id; community; status pending | 1, 1, 2 rows | as expected | Pass | log | new |
| TC-I06 | UC-A15 | Delete community with history | P0 | SA | settled transfer | `DELETE /admin/communities/{id}` | 422; community and transfer remain | as expected | Pass | log | F-20 |
| TC-I07 | UC-E04, I05 | Provider error details | P1 | R | create 4xx with meta.path | pay | 422 `INVALID_ACCOUNT`; no `/transfer/create` in body; failed attempt | as expected | Pass | log | F-23 |

## Matrix — real Plaid Sandbox (`tests/Feature/PlaidSandboxE2ETest.php`)

| Test ID | UC | Scenario | Pri | Steps | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| S-1 | UC-E01, F11, G03, G09, E02 | Real request shapes and lifecycle | P0 | `/sandbox/public_token/create` ×2 (ins_109508, auth+transfer) → pay $12.34 → simulate posted → refresh → simulate settled → refresh → refund; pay $7.50 → simulate posted, returned R01 → `/transfer/event/sync` from seeded cursor; pay $9000 | debit accepted; processing→posted (bill paid)→settled; refund never shown settled; return R01 reopens bill; $9000 NSF decline | Debit accepted with `idempotency_key`, `device`, `user_present`. **Payout credit declined (ledger has no available balance) → `payout_failed`.** **Refund rejected: "insufficient available balance to process credit transfer" → `refund_failed`.** Return applied via event sync (fetched 3, applied 1), `R01`, bill unpaid. NSF decline message shown. | Pass | `.tmp/plaid-sandbox.txt` |

## Existing automated tests (re-run this pass)

| Suite | Tests | Status | Notes |
|---|---|---|---|
| `PlaidAchPaymentTest`, `PlaidConnectionTest`, `PlaidExchangeTokenTest`, `PlaidLifecycleTest`, `PlaidLinkTokenTest`, `PlaidEligibilityServiceTest` | 49 (baseline before changes: 49 pass) | Pass | In `PlaidAchPaymentTest` four tests now assert the corrected behaviour: idempotency key required on authorization; SSL failure **fails** the booking; cancel/decline refunds assert `refund_status=settled` (simulated mode) |
| Regression: `AmenitySharedBillTest`, `AmenityBookingFeeTest`, `AmenityOwnershipTest`, `AmenityOvernightHoursTest`, `AmenitySlotsTest`, `KuickpayPaymentsTest`, `KuickpayPaymentsReviewTest`, `KuickpayHttpGatewayTest`, `PropertyServiceBillingTest`, `ActivityLogCentralizedTest` | — | Pass | |
| `AmenitySlotCapacityTest::amenity_create_stores_capacity_booking_type` | 1 | **Fail (pre-existing, unrelated)** | 422 "floor: Use at least 2 characters" — validation added in commit `3ea0c17` |
| `ResidentModeTest::resident_mode_respects_community_feature_flags` | 1 | **Fail (pre-existing, unrelated)** | Feed feature disabled — approval flow from commit `c718deb` |

Combined filtered run: **263 passed, 2 failed (unrelated)** in 319 s. Full-suite totals: see `plaid-fixes-and-results.md`.

## Manual UI checks (Not Run — require a browser session)

| Test ID | UC | Check | Status |
|---|---|---|---|
| M-1 | UC-B03 | Community Admin `/admin/plaid`: open Link, close it → toast, no exchange call | Not Run |
| M-2 | UC-J02 | Connect/replace buttons disabled while busy; double-click sends one request | Not Run |
| M-3 | UC-A04 | Sandbox badge + copy on `/admin/plaid`; production copy when `PLAID_ENV=production` | Not Run |
| M-4 | UC-A02..A14 | System Admin `/admin/bank-payments`: config flags, health, communities table, pause with reason, filters, search, Refresh, Mark reviewed | Not Run |
| M-5 | UC-J05 | Mobile reservation screen hides "Pay with bank" when community paused / kill switch off | Not Run |
| M-6 | UC-E09 | Mobile: close app during payment, reopen → status from server | Not Run |
| M-7 | UC-J01 | Resident labels: Processing, Awaiting confirmation, Returned (R01), Refund pending, Refunded, Refund failed | Not Run |
| M-8 | UC-J05 | Mobile accessibility / layout of the bank-payment states | Not Run |

## Blocked / not runnable locally

| Test ID | UC | Scenario | Blocker |
|---|---|---|---|
| B-1 | UC-E01, G03 | Payout and refund that succeed | Ledger funding in Sandbox (`/sandbox/transfer/ledger/deposit/simulate` or prefunded ledger) **and** decision D-1 on payout timing |
| B-2 | UC-F01 | Live webhook signed by Plaid reaching the server | Public HTTPS `PLAID_WEBHOOK_URL` registered with Plaid; UAT deploy |
| B-3 | UC-B08, C03 | Micro-deposit verification | Not configured (D-8) |
| B-4 | UC-E06 | True parallel requests (two processes) | PHPUnit runs single-process; lock verified by code review + TC-E10 |
| B-5 | all | Production behaviour | Production Plaid Transfer approval, keys, ledger, Nacha authorization text (D-3) |
| B-6 | UC-G15 | Dispute workflow | Not implemented |

## Totals (this pass)

| | Count |
|---|---|
| Use cases | 122 (A 16, B 17, C 9, D 10, E 15, F 14, G 16, H 10, I 8, J 7) |
| New automated (mock) test cases | 39 — **Pass 39** |
| Real Sandbox test cases | 1 (S-1, 15 assertions) — **Pass 1** |
| Existing Plaid tests re-run | 49 — **Pass 49** |
| Manual UI checks | 8 — **Not Run 8** |
| Blocked | 6 |
| Unrelated pre-existing failures observed | 2 |
