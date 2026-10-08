# KuickPay Payments — Fixes and Results

**Date:** 2026-10-07 · **Build:** local, not deployed · **Provider traffic:** simulator and HTTP fixtures only.

## Verdict

The integration is **not production-ready**. All executed tests pass and seven defects were fixed, but five P0
checks are blocked on KuickPay onboarding (UAT credentials, the return-signature definition, the checkout status
API and the Bill Initiator funding flow). Without those, a lost return in live mode cannot be recovered
automatically (see R-1).

## Defects fixed

Each fix was reproduced: the regression test was run with the fix temporarily reverted and **failed**, then
passed with the fix (`.tmp/prove-regressions.php`).

| ID | Pri | Defect | Root cause | Fix | Regression test |
|---|---|---|---|---|---|
| D-1 | P0 | A production deploy with default config would serve the **sandbox**: anyone could "pay" real bills with fake money | `KUICKPAY_MODE` defaults to `sandbox` and nothing checked `APP_ENV` | `PaymentRouting::kuickpayOperational()` refuses sandbox when `APP_ENV=production` unless `KUICKPAY_ALLOW_SANDBOX_IN_PRODUCTION=true`; sandbox pages 404 too | `test_tc_c13_sandbox_is_refused_when_app_env_is_production` |
| D-2 | P1 | Duplicate "Payment successful" / "Payment received" notifications and activity logs when a second path (reconcile, channel payment, retry) re-entered settlement | `succeed()` returned early inside the transaction but still notified afterwards whenever the attempt was succeeded | Notify only when this call performed the transition; follow-ups wrapped so a notification/audit failure cannot surface as a payment error | `test_tc_f05_replayed_success_notifies_exactly_once` |
| D-3 | P0 | On move-out, the new billing contact received the previous resident's bill **with their payment proof, bank reference and notes**; bills mid-way through an online payment also moved | `attachCurrentBillingContacts` reassigned `pending_verification` bills and copied proof fields | Do not reassign bills under review or with an active payment attempt; when a bill does move, clear proof/payment fields (kept in review history) and reset a rejected bill to unpaid/overdue | `test_tc_a11_move_out_does_not_expose_previous_residents_proof_or_payment` |
| D-4 | P0 | Deleting a service **cascade-deleted bills paid through KuickPay** (and bills mid-payment), losing financial records | FK `cascadeOnDelete` from `property_services` to `unit_service_bills` with no guard | Block deletion when any of its bills has an active, succeeded or refund-pending online payment; admin is told to set it inactive | `test_tc_a12_service_with_online_payments_cannot_be_deleted` |
| D-5 | P0 | A signed **SUCCESS arriving after a signed FAILED** (out of order) was ignored — money taken, bill unpaid | Late-charge handling only covered `cancelled`/`expired` attempts | Treat `failed` like `cancelled`/`expired`: apply the payment if the bill is still unpaid, else `refund_pending` | `test_tc_d07_out_of_order_success_after_failure_still_settles_the_bill` |
| D-6 | P2 | Zero-amount bill gave the misleading "This bill is no longer active" | `isPayable()` folded zero amount into the inactive message | `nothing_due` / "This bill has no amount due." | `test_tc_a08_zero_amount_bill_cannot_be_paid` |
| D-7 | P1 | Expired/cancelled payments told residents "**You have not been charged**" — Havena cannot know that without a status API | Message assumed no charge | Truthful copy: bill unpaid; if money left the account it is matched when KuickPay confirms; keep the reference | `test_tc_e05_success_after_local_expiry_is_applied_when_bill_is_still_unpaid` |
| D-8 | P2 | A lock timeout on the return handler threw a 500 to the resident's browser | `block(10)` with no handler | Wait up to 30 s; on timeout log, record `return_lock_timeout`, show the current status | Covered by code review (not reproducible with the array cache) |
| D-9 | P2 | Declining/unsubscribing could delete a bill with an active online payment | `removeUnpaidSubscriptionBills` had no payment check | Skip bills with active attempts | Covered by D-4 query pattern; no direct test |

Test-harness issue found while writing tests (not a product defect): `Http::fake()` appends stubs, so earlier
fixtures shadowed later ones — gateway tests now reset the HTTP factory per scenario.

## Behaviour confirmed but intentionally **not** changed (needs a product decision)

| ID | Behaviour | Why left alone |
|---|---|---|
| O-1 | Automatic bills are generated for **vacant** units and deferred to the first billing contact who moves in | Suppressing or prorating is an accounting rule; not invented here |
| O-2 | A former billing contact keeps seeing (and can pay) their own outstanding bills for a unit they left while it stays vacant | Debt-follows-person vs debt-follows-unit is a business rule |
| O-3 | Unpaid bills of a resident who moved out transfer to the next billing contact (with private fields now cleared) | Existing billing design |

## Test commands and results

```
php artisan test --filter="KuickpayPaymentsReviewTest|KuickpayHttpGatewayTest"
  Tests: 30 passed (199 assertions)

php .tmp/prove-regressions.php           # each fix reverted in turn
  F1..F7: without fix -> FAILED as expected (7/7)

php artisan test --filter="Kuickpay|PropertyServiceBillingTest|AmenitySharedBillTest|PlaidAchPaymentTest|PlaidLifecycleTest|UnitServiceBill|BillingContact"
  Tests: 122 passed (1257 assertions)    # 47 KuickPay + 75 regression
```

Totals: **passed 122 automated** (+2 manual/review), **failed 0**, **blocked 5**, **not run 4** (see test-case matrix).

## Files changed in this pass

- `backend/app/Services/Payments/PaymentOrchestrator.php` — D-2, D-5, D-6, D-8
- `backend/app/Services/Payments/PaymentRouting.php` — D-1
- `backend/app/Services/Payments/OnlinePaymentPresenter.php` — D-7
- `backend/app/Http/Controllers/Api/V1/KuickpayGatewayController.php` — D-1 (sandbox pages)
- `backend/app/Services/UnitServiceBillService.php` — D-3, D-9
- `backend/app/Services/PropertyServiceCatalogService.php` — D-4
- `backend/config/kuickpay.php` — `allow_sandbox_in_production`
- `backend/tests/Feature/KuickpayPaymentsReviewTest.php` (new, 22 tests)
- `backend/tests/Unit/KuickpayHttpGatewayTest.php` (new, 8 tests)
- `docs/payments/kuickpay-use-cases.md`, `kuickpay-test-cases.md`, this file (new)

No new migrations in this pass. Existing migration `2026_10_07_120000_create_kuickpay_payments_tables` is still
required on any environment that receives KuickPay.

## Configuration

| Key | Value for production |
|---|---|
| `KUICKPAY_MODE` | `live` (or `uat` on the UAT server). Leaving it `sandbox` now disables KuickPay in production. |
| `KUICKPAY_ALLOW_SANDBOX_IN_PRODUCTION` | leave unset/false (only for a deliberate demo server) |
| `KUICKPAY_COMPANY_ID`, `KUICKPAY_SECURED_KEY` | Checkout credentials |
| `KUICKPAY_API_KEY`, `KUICKPAY_INITIATOR_ID` | Bill Initiator credentials (server IP must be whitelisted) |
| `KUICKPAY_INSTITUTION_ID`, `_PREFIX`, `_USERNAME`, `_PASSWORD` | Institution End-to-End |
| `KUICKPAY_CHECKOUT_STATUS_PATH` | Status API path once KuickPay documents it |
| `KUICKPAY_PUBLIC_API_URL` | `https://apis.gohavena.com` (HTTPS is mandatory for `returnurl`) |
| Scheduler | `kuickpay:reconcile` every minute, `kuickpay:sync-billers` daily — cron must run `schedule:run` |

## Remaining risks

| ID | Risk | Mitigation today | Needed |
|---|---|---|---|
| R-1 | Live mode has **no documented status inquiry**: if the return never arrives the attempt expires; a later return is still applied, but no automatic recovery exists without it | Late-return handling; truthful expiry copy; admin ledger | KuickPay status API or settlement report + reconciliation |
| R-2 | Return-signature input is assumed | Constant-time HMAC check; unverified returns change nothing | KuickPay to confirm signature fields/encoding (docs examples mix hex and base64) |
| R-3 | Utility payments assume Checkout funds BillPaymentV3 | Biller rejection → refund_pending | KuickPay UAT demonstration (spec §28) |
| R-4 | Refunds are recorded manually | `refund_pending` queue + admin alert | KuickPay refund process |
| R-5 | Concurrency proven by locks + DB constraints, not by parallel workers | `active_lock` unique, `FOR UPDATE` | Load test with ≥2 PHP-FPM workers and Redis/DB cache store |
| R-6 | Production cache store must support atomic locks | — | Confirm `CACHE_STORE` on the server (file/database/redis OK) |

## Exact manual / sandbox checks still required

1. KuickPay UAT: Create Session with real credentials; complete card, Easypaisa, JazzCash, bank and Raast payments;
   confirm the return parameters and verify the signature (TC-C16, TC-D12).
2. Cancel on the KuickPay page and close the browser mid-payment; confirm Havena's status (TC-C14 on device).
3. Ask KuickPay for the checkout status endpoint; set `KUICKPAY_CHECKOUT_STATUS_PATH`; re-run TC-E03.
4. Register `/api/v1/integrations/kuickpay/bill-inquiry` and `/bill-payment` in KuickPay's Integration Setup; pay a
   Havena voucher from a bank app in UAT (TC-D13).
5. Bill Initiator UAT: GetBillers, BillInquiryV3 and BillPaymentV3 for one K-Electric/LESCO account; confirm funding
   and the duplicate (`03`) and unknown (`05`) behaviour (TC-U06).
6. iOS and Android build: Pay Now → KuickPay → return → result screen, app killed during checkout, history after
   restart (TC-C14, TC-F05, TC-B07).
