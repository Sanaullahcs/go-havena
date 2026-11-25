# Plaid (US) — Fixes and Results

**Date:** 2026-10-07 · **Build:** local only, not deployed · **Provider traffic:** recording fake + real Plaid **Sandbox** (no real money).

## Verdict

**Not production-ready.** The money-movement defects found in code were fixed and covered by tests (39 new mock tests,
1 real-Sandbox lifecycle test, all 49 existing Plaid tests pass). But Plaid Sandbox showed that, as designed, the
**community payout and refunds cannot succeed without available funds in Havena's Plaid Ledger**, and several
business decisions (payout timing, ACH authorization text, payout-account approval, refund policy) are open.

## Defects fixed

"Reproduced" says how the defect was confirmed before fixing. **Baseline** = an existing test passed while asserting
the defective behaviour; **Trace** = confirmed by reading the code path and the Plaid docs (the regression test was
written against the fixed code and was not run against the old code); **Sandbox** = observed in Plaid Sandbox.

| ID | Pri | Defect | Root cause | Fix | Reproduced | Regression test |
|---|---|---|---|---|---|---|
| F-01 | P0 | ACH settlements, failures and **returns were never applied** | `TRANSFER_EVENTS_UPDATE` carries no transfer id; handler called `/transfer/event/sync` with `after_id:0`, `count:25` and discarded the response | Store every event (unique `event_id`, cursor = max), page with `has_more`, apply in order under row locks; scheduled `plaid:sync-events` (5 min) and `plaid:reconcile` (hourly) | Trace | TC-F01, F03, F06, F08; S-1 |
| F-02 | P0 | Duplicate debit possible on retry | No `idempotency_key` on `/transfer/authorization/create` (Plaid: omitting it "may result in duplicate charges"); a test enforced *not* sending one | Key per attempt on debit (`db-…`) and credit (`cr-…`) authorizations; none on `/transfer/create` (not accepted there) | Baseline (`test_live_charge_books_without_sending_idempotency_key`) | TC-E01, S-1 |
| F-03 | P0 | **Forged success**: any Plaid error/SSL failure outside `PLAID_ENV=production` marked the payment **posted** with fake ids and accepted the booking | `canFallback()` / `sandboxTransportFallback()` auto-simulated | Removed all automatic fallbacks; simulation only when `PLAID_TRANSFER_SIMULATE=true` and never with `PLAID_ENV=production` | Baseline (`test_sandbox_ssl_failure_still_completes_the_booking`) | TC-E05 |
| F-04 | P0 | Missing/garbled authorization treated as approved | `data_get(..., 'decision', 'approved')` and `in_array($decision, ['approved',''])` | Require explicit `approved`; NSF/RISK/limit messages; payout decision now checked too | Trace | TC-E02, E03, E12 |
| F-05 | P0 | **Fictional refunds**: refund recorded as completed the moment it was requested; on Plaid error in non-production a fake refund was recorded | Refund wrote `status=refunded` immediately; fallback created `sim_refund_*` | Separate `refund_status` driven by Plaid (`pending→posted→settled`, failed/returned); failures recorded + exception; one refund per payment under lock | Baseline (refund tests asserted instant `refunded`); Sandbox (refund rejected) | TC-G02, G03, G04; S-1 |
| F-06 | P0 | Cancelling or declining a reservation whose debit was still **pending** kept the money | `canRefund()` required posted; nothing else ran | Cancel at Plaid when `cancellable`, cancel payout if possible; otherwise refund, otherwise `refund_required` exception | Trace | TC-G01 |
| F-07 | P0 | **Wrong recipient**: after replacing the community bank, payouts could still go to the old account | `transfer_access_token` (from `/transfer/migrate_account`) was not cleared and is preferred | Clear on connect/replace | Trace | TC-B02 |
| F-08 | P0 | **Lost payment record**: debit ran inside the booking DB transaction; any later exception rolled back the `plaid_transfers` row of a real debit; the cleanup also deleted transfer rows | `payBooking()` inside `DB::transaction`; `discardFailedBookingAttempt()` deleted rows | Debit after the reservation commits; never delete transfer rows; keep the reservation if a debit may exist | Trace | TC-E06, E02 |
| F-09 | P0 | Webhook "verification" accepted any request with a non-empty `Plaid-Verification` header | Stub `verified()` | Full ES256 JWT check (alg, `kid` key fetch + cache, signature, `iat` ≤ 5 min, constant-time body SHA-256); default on in production | Trace | TC-F07 |
| F-10 | P0 | Global disable did not stop payments | `plaid.transfer.enabled` only fed the capability payload | Enforced in `collect()` via `readiness()` | Trace | TC-E07 |
| F-11 | P1 | Status regressions | `funds_available` and unknown/empty statuses mapped to `processing`; no ordering guard; `settled_at` reset on every refresh | Monotonic mapping; unknown ignored; terminal final; returns allowed after posted/settled | Trace | TC-F02, F05 |
| F-12 | P0 | A provider refresh after a refund overwrote `refunded` with `settled`, re-accepting the cancelled booking; return-after-refund invisible | Debit and refund shared one `status` field | Separate lifecycles; `coversCharge()`; `returned_while_refunded` exception | Trace | TC-G02, G05 |
| F-13 | P1 | A failed **replace** destroyed the working connection (community and resident) | Old Item removed **before** exchanging the new public token | Exchange first; remove old Item only after save | Trace | TC-B01 |
| F-14 | P0 | Moderators (incl. resident-role users with a moderator membership) could replace the payout account | `isActiveCommunityAdmin()` accepts moderator memberships | Mutating Plaid routes require membership role `admin` (or approved community admin not a moderator) | Trace | TC-B03 |
| F-15 | P1 | Concurrent payments for the same charge | Existence check without locks | Lock charge row + open transfers in a transaction | Trace | TC-E10 |
| F-16 | P0 | Timeout after Plaid accepted the authorization → recorded failed, booking deleted, resident free to pay again | All exceptions treated as definite failure | 5xx/transport at `/transfer/create` → `authorized` + `outcome_unknown`, charge kept pending, retry blocked | Trace | TC-E06 |
| F-17 | P1 | Payout failure hidden | `needs_payout` overwrote the debit status; credit decision unchecked | `credit_status` + `payout_failed` exception; debit status preserved | Sandbox (payout declined) | TC-E12; S-1 |
| F-18 | P0 | Wrong balances: a failed/returned ACH reopened a bill already paid another way; an ACH landing on a paid bill overwrote it | `applyAchTransfer()` ignored which payment was on record | Only the transfer on record changes the bill; duplicates flagged; refunds never auto-reopen | Trace | TC-G06, G07, F03 |
| F-19 | P1 | Duplicate "payment received/failed" notifications on each refresh | Notify on every posted/failed refresh | `notified_status` gate (atomic update) | Trace | TC-F01, F03, G02 |
| F-20 | P0 | Deleting a community or user erased payment history | `cascadeOnDelete` FKs; no guard | FK restrict (community) / null (user); delete blocked with history | Trace | TC-I06 |
| F-21 | P1 | Cancelled/rejected booking payable via direct API | No status check | Only `pending/awaiting_payment/confirmed` | Trace | TC-D01 |
| F-22 | P0 | `APP_ENV=production` with Plaid sandbox/simulation would mark real bills paid with test money | No environment cross-check | Refused unless `PLAID_ALLOW_SANDBOX_IN_PRODUCTION=true` (mirrors KuickPay D-1) | Trace | TC-E09 |
| F-23 | P2 | Error responses exposed Plaid request path / HTTP status | `render()` returned all `meta` | Allow-list `missing`, `environment`, `reason` | Trace | TC-I07 |
| F-24 | P2 | Tokens/ACH numbers serializable | No `$hidden` | Added to both connection models | Trace | TC-I02 |
| F-25 | P2 | `user_action_required` gave a generic decline | Not distinguished | Resident connection → `needs_attention`, reconnect prompt | Trace | TC-E04 |
| F-26 | P2 | Misleading dashboard copy ("Havena never takes the funds", "Cancel … refunds the ACH", always "Sandbox", "posts in 1–3 business days") | Copy | Rewritten; environment badge | Trace | Manual M-3 |
| F-27 | P1 | Refund failures on cancel were swallowed (`report()`), leaving no record | try/catch | Exception `refund_required`/`refund_failed` recorded | Trace | TC-G03 |
| F-28 | P1 | Inactive community could still take payments | No status check | Readiness `community_inactive` | Trace | covered by readiness code; no dedicated test |

Test-data corrections during this pass (not product defects): two new tests first expected bill status `pending`; the
real constant is `pending_verification`.

## New System Admin capabilities

`/admin/bank-payments` (web) and `/api/v1/admin/plaid/*` (system admin only): config health without secrets, webhook
and sync health, per-community readiness with reason, pause/resume with mandatory reason, payment search/filters,
exceptions queue, read-only Plaid refresh, event sync, review notes. See `plaid-system-admin-setup.md`.

## Decisions required (not invented here)

| ID | Decision | Why it blocks |
|---|---|---|
| D-1 | **When and how to pay communities.** Today the credit is sent right after the debit is created. Plaid holds debit funds until `funds_available`; Sandbox declined the payout for insufficient ledger balance. Options: prefund the ledger, pay out after `funds_available`, or batch payouts. Also: who absorbs returns after payout (Havena vs community clawback). | P0 — payouts and refunds fail in practice |
| D-2 | Must a System Admin approve a new or replaced payout account before payments resume? Should a reason be mandatory in the UI? | Wrong-recipient risk |
| D-3 | ACH debit authorization: Nacha WEB requires consumer authorization; Plaid Transfer requires you to obtain it. No authorization text is shown or stored. Need approved wording, versioning, and whether recurring debits are wanted. | Compliance — required before production |
| D-4 | Partial refunds and refunds for shared amenity bills; whether a refund should reopen a bill. | Missing feature |
| D-5 | Transaction/refund limits, approval thresholds, two-person approval, manual refund rights for System Admin. | Policy |
| D-6 | A community with **no country set** is treated as Plaid-eligible. Keep or require explicit US? | Could expose Plaid to non-US communities |
| D-7 | In-app global kill switch (today: env var only). | Operability |
| D-8 | Micro-deposit / Same-Day micro-deposit verification for institutions without instant Auth. | Coverage |
| D-9 | If a bill's amount changes while a payment is in flight, what is owed? | Balance accuracy |
| D-10 | **Vacant-unit billing:** you described the rule "no automatic service bill for a vacant unit". Current code (`UnitServiceBillService`) has no vacancy check and `KuickpayPaymentsReviewTest::a09` asserts that bills **are** generated for vacant units and deferred to the next resident. Not Plaid-payable; left unchanged pending confirmation. | Billing rule conflict |

## Commands executed

```
php artisan test --filter Plaid                     # baseline, before changes
  49 passed (215 assertions)

php -l <25 changed PHP files>                       # no syntax errors

php artisan test --filter PlaidTransferLifecycleTest
  37 passed, 2 failed (test-data status string) -> fixed -> rerun 2 passed

php artisan test --filter "Plaid|AmenitySharedBillTest|Kuickpay|PropertyServiceBillingTest|ActivityLogCentralizedTest|ResidentModeTest|Booking|Amenity"
  263 passed, 2 failed (1999 assertions)            # both failures unrelated, see test-cases doc

php artisan plaid:status                            # sandbox configured, API reachable
PLAID_SANDBOX_E2E=1 php artisan test --filter PlaidSandboxE2ETest
  1 passed (15 assertions)                          # real Plaid Sandbox

npx tsc --noEmit -p frontend                        # 109 pre-existing errors, none in files changed here
npx eslint <changed frontend files>                 # clean after one fix (setState in effect)

php artisan test                                    # full backend suite — see "Full suite" below
```

Evidence files (local, gitignored `.tmp/`): `plaid-baseline.txt`, `plaid-new.txt`, `plaid-regress.txt`,
`plaid-sandbox.txt`, `tsc-plaid.txt`, `full-suite.txt`.

### Sandbox observations (2026-10-07)

```
[A] status=processing debit=958279eb-… credit_status=declined exception=payout_failed
[A refund] refund_status=failed exception=refund_failed msg=insufficient available balance to process credit transfer
[B sync] {"fetched":3,"matched":3,"unmatched":0,"applied":1,"cursor":17}   -> returned, R01, bill unpaid
[C] PLAID_TRANSFER_FAILED: Your bank account does not have enough available funds for this payment. You have not been charged.
```

## Full suite

`php artisan test` (whole backend) **aborts after ~400 s**: `NearbyPlaceController` calls `set_time_limit(20)`, and once
`OsmPlacesTest` / `MarketplaceBusinessDealsTest` hit it, the single PHPUnit process dies on the next slow step. This is
a pre-existing test-harness problem.

Re-run excluding those two classes:

```
php artisan test --filter '/^(?!Tests\\Feature\\(OsmPlacesTest|MarketplaceBusinessDealsTest)::)/'
  Tests: 56 failed, 1 skipped, 755 passed (4962 assertions)
```

All Plaid, KuickPay, amenity-bill and booking suites pass. The 56 failures are outside the Plaid code paths and were
traced to other uncommitted or recent work:

| Count | Cause | Source |
|---|---|---|
| 15 | "Enter a valid phone number in international format" — fixtures use old phone formats | phone validation change (not in this pass) |
| 8 | `Class App\Http\Controllers\Api\V1\UtilityBillStorage not found` — missing `use App\Services\UtilityBillStorage` | `AdminCommunityAdminController.php` (commit `5cb1ec7`, untouched here) |
| ~13 | 403/405 on community-admin feature routes (rules, documents, feed, listings, members) | community feature approval gate (commit `c718deb`, `EnsureAdminRouteFeature`) |
| ~20 | New validation messages (report detail, future date, location required, `floor` min 2, email immutable, PK billing exemption) | recent validation commits |

These were not fixed in this pass (out of scope); the missing import is a one-line fix worth doing separately.

## Files changed in this pass

Backend
- `app/Services/PlaidAchService.php` — F-01..F-06, F-08, F-10..F-12, F-15..F-19, F-22, F-25, F-28; readiness; event sync; cancel/refund
- `app/Services/PlaidWebhookVerifier.php` (new) — F-09
- `app/Http/Controllers/Api/V1/PlaidWebhookController.php` — F-09, health timestamps
- `app/Http/Controllers/Api/V1/AdminPlaidController.php` (new) — System Admin API
- `app/Http/Controllers/Api/V1/PlaidController.php` — F-14, reasons
- `app/Http/Controllers/Api/V1/PlaidPaymentController.php`, `AmenitySharedBillController.php` — initiation context, truthful messages
- `app/Http/Controllers/Api/V1/AmenityController.php` — F-06, F-08, F-27
- `app/Http/Controllers/Api/V1/AdminCommunityController.php` — F-20
- `app/Services/PlaidService.php`, `PlaidResidentService.php` — F-07, F-13, audit masks/reasons
- `app/Services/AmenitySharedBillService.php` — F-18
- `app/Models/PlaidTransfer.php`, `PlaidTransferEvent.php` (new), `CommunityPlaidConnection.php`, `ResidentPlaidConnection.php` — lifecycles, F-24
- `app/Exceptions/PlaidException.php` — F-23, new error types
- `app/Console/Commands/PlaidSyncEventsCommand.php`, `PlaidReconcileCommand.php` (new); `bootstrap/app.php` schedule
- `app/Support/ActivityActionCatalog.php`, `config/plaid.php`, `routes/api.php`
- `database/migrations/2026_10_07_160000_add_lifecycle_tracking_to_plaid_transfers.php` (new)
- Tests: `tests/Feature/PlaidTransferLifecycleTest.php` (new), `tests/Feature/PlaidSandboxE2ETest.php` (new), `tests/Support/FakePlaidHttp.php` (new), `tests/Feature/PlaidAchPaymentTest.php` (updated)

Frontend
- `src/app/(admin)/admin/bank-payments/page.tsx` (new), `src/lib/api/admin-plaid.ts` (new)
- `src/app/(admin)/admin/plaid/page.tsx` — F-26
- `src/components/admin/sidebar.tsx`, `src/lib/auth/admin-routes.ts` — navigation/gating

Mobile: no change needed — it already hides bank payment when `ach_enabled` is false, which now reflects readiness.

## Deploy notes (not performed)

1. `php artisan migrate --force` (FK change on `plaid_transfers` is non-destructive).
2. If production currently runs Plaid **sandbox** for demos, payments will be refused after deploy until
   `PLAID_ALLOW_SANDBOX_IN_PRODUCTION=true` is set deliberately.
3. Ensure the scheduler runs; set `PLAID_WEBHOOK_URL`; keep `PLAID_VERIFY_WEBHOOKS` on.
4. Legacy rows with `status=needs_payout` / `refunded` remain readable; they are not migrated.

## Sandbox and manual checks still needed

1. Fund the Sandbox ledger (`/sandbox/transfer/ledger/deposit/simulate`) and repeat S-1 to see a successful payout and refund; then decide D-1.
2. Register a public `PLAID_WEBHOOK_URL` on UAT and fire `/sandbox/transfer/fire_webhook`; confirm the signature check passes on real Plaid JWTs and events apply.
3. Simulate `/sandbox/transfer/refund/simulate` (posted/settled/failed) and a payout return; confirm exceptions.
4. Cancel a pending Sandbox debit through a booking cancel (`/transfer/cancel`) end to end.
5. Item `ITEM_LOGIN_REQUIRED` via `/sandbox/item/reset_login` → authorization `user_action_required` → reconnect.
6. Manual UI checks M-1 … M-8 in `plaid-test-cases.md` (web dashboards and mobile).
