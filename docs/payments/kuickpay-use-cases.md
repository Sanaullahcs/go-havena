# KuickPay Payments — Use Cases

**Scope:** Pakistan communities only. US communities keep Plaid ACH; a community never sees both
(`App\Services\Payments\PaymentRouting`).
**Reviewed:** 2026-10-07 against the local build (not deployed).
**Provider references used:** `.tmp/payment-spec.txt` (Havena payments spec v1.0) and the public pages on
`developers.kuickpay.com` — Checkout (Create Session, Signature Guide, Handle Return), Bill Initiators
(GetBillers, BillInquiryV3, BillPaymentV3) and Institution Integration (End-to-End, Hybrid).

---

## 1. What is actually implemented

Havena implements **three separate KuickPay capabilities**. They are not the same thing and are tested separately.

| Capability | Who issues the bill | KuickPay mode | Havena code |
|---|---|---|---|
| Havena bills paid in the app | Havena (unit service bills, shared amenity bills, paid-booking bills) | **Checkout** (hosted page) | `PaymentOrchestrator::pay`, `KuickpayGatewayController` |
| Havena bills paid from any bank/wallet app | Havena | **Institution End-to-End** (KuickPay calls Havena) | `KuickpayInstitutionController` (`bill-inquiry`, `bill-payment`) |
| External utility bills (K-Electric, LESCO, SNGPL …) | The utility | **Bill Initiator** (`BillInquiryV3`, `BillPaymentV3`) + Checkout for the resident's money | `UtilityBillService`, `PaymentOrchestrator::finalize` |

Hybrid (Insert Voucher / Payment Inquiry / Bulk Inquiry) is **not implemented**.

### End-to-end flow (Havena bill, in-app)

1. **Bill created** — automatic service job / admin "Generate bills" / approved optional subscription
   (`UnitServiceBillService::generateBillForUnit`), or shared/booking amenity bill (`AmenitySharedBillService`).
2. **Resident views bill** — `GET /api/v1/service-bills`, `GET /api/v1/amenity-bills/mine`. Each bill carries an
   `online_payment` block (`OnlinePaymentPresenter::forPayable`): availability, active payment, last payment,
   18-digit KuickPay voucher.
3. **Pay Now** — `POST /api/v1/payments {payable_type, payable_id, expected_amount_paisa?}`. Server resolves the bill,
   checks the payer, computes the amount, takes a cache lock and a DB `active_lock`, creates `payment_attempts` row,
   calls Checkout *Create Session* (HMAC-SHA256 over `companyid|orderid|amount|amountPayable|timestamp`).
4. **KuickPay page** — app opens `GET /api/v1/payments/kuickpay/launch/{token}` in an in-app browser; it 302s to
   KuickPay's `redirectURL`.
5. **Return** — KuickPay redirects to `GET|POST /api/v1/payments/kuickpay/return/{payment}` with
   `orderid, transactionid, amount, status, responsecode, signature`. Havena checks order id, signature, attempt state
   and amount, then settles.
6. **Bill update** — in one DB transaction: attempt → `succeeded`, bill → `paid`, `payment_method=kuickpay`,
   review row `paid_online`. Notice hidden from Home; awaiting-payment booking confirmed.
7. **Receipt & history** — `GET /api/v1/payments/{id}` (receipt only when `succeeded`), `GET /api/v1/payments`.
   Resident + admins notified once.
8. **Reconciliation** — `kuickpay:reconcile` every minute: expires abandoned checkouts, re-checks unknown outcomes,
   re-runs settlements that crashed after authorisation.

### Tables

`payment_attempts` (one row per Pay Now; unique `idempotency_key`, `reference`, `provider_order_id`, `launch_token`,
and nullable-unique `active_lock` = one active attempt per bill), `payment_events` (append-only timeline),
`kuickpay_inbound_payments` (unique `tran_auth_id + consumer_number`), `utility_billers`, `utility_accounts`
(reference encrypted + keyed hash + last 4), `utility_bills` (unique account + month), `community_payment_profiles`.
Bill tables gained `payment_attempt_id` and (`unit_service_bills`) `payment_method`.

### Statuses

Attempt: `created → awaiting_authorization → authorized → (submitted_to_biller) → pending_confirmation → succeeded`,
plus `failed`, `cancelled`, `expired`, `refund_pending`, `refunded`. Residents see a reduced set:
`awaiting_payment`, `processing`, `succeeded`, `failed`, `cancelled`, `expired`, `refund_pending`, `refunded`.

### What could not be verified from the provider documentation

| Item | Implemented assumption | Status |
|---|---|---|
| Checkout **return signature** algorithm | HMAC-SHA256, lowercase hex, over `orderid|transactionid|amount|status|responsecode` with SecuredKey | **Unverified** — docs say "verify the signature" but do not define its input |
| Checkout **status inquiry** endpoint | Configurable `KUICKPAY_CHECKOUT_STATUS_PATH`; empty → reconciliation relies on the return only | **Unverified** — docs mention a "Status API" without documenting it |
| Payment method in return (`method`) | Read if present (sandbox sends it) | Not in KuickPay docs |
| BillInquiryV3 amount/month format | Accepts AN14 *and* plain paisa; YYMM *and* MMYY | Docs contradict each other; both handled |
| BillPaymentV3 funding | Checkout collects resident money, then BillPaymentV3 settles the utility | **Unverified** — spec §28 lists this as the blocking provider question |
| Institution auth | `username` / `password` headers | Documented ("username/password headers you provide") |
| Refunds / reversals | Manual: admin records "refunded" after KuickPay refunds | No refund API documented |

---

## 2. Use cases

Notation: **R** = resident, **BC** = unit billing contact, **CA** = community admin, **SA** = system admin,
**KP** = KuickPay. Sample data comes from `KuickpayPaymentsTest` / `KuickpayPaymentsReviewTest` fixtures
(community "Tower 1", region "Pakistan - Lahore", resident Zainab Haider, unit A-1101).

### A. Bill creation and resident eligibility

**UC-A1 — Create a valid bill for an eligible unit**
- Actor: CA (manage services). Preconditions: active automatic service; residential unit with a billing contact.
- Data: Maintenance, Rs 2,500, due day 15, first month 2026-12.
- Flow: CA creates service → `generateCurrentPeriodIfDue` / "Generate bills" → `generateBillForUnit`.
- Expected: one `unit_service_bills` row per residential unit, linked to community, service, unit and the effective
  billing contact; finance notice + push to that contact only; office units skipped.
- Alternate: unit without contact → bill created with `billing_contact_user_id = NULL` (see UC-A9), admins notified.
- Acceptance: correct links; no bill for office units; contact-only visibility.

**UC-A2 — Automatic recurring bills**
- Trigger: hourly `service-bills:process-reminders` / `generateDueAutomaticBills`, and lazily on the resident list.
- Expected: one bill per unit per billing period, only from `first_billing_month`, only while service is active.
- Acceptance: inactive services generate nothing; reactivation resumes the current period.

**UC-A3 — No duplicate bills** — DB unique `(service_id, unit_id, billing_period)` plus `alreadyBilled` check; a second
generate for the same period reports `created_count: 0`.

**UC-A4 — Required fields** — service create/update validates name, category, application type, frequency, due day
1–31, first billing month for automatic/yearly, custom category for "other".

**UC-A5 — Amount rules** — `numeric|min:0.01|max:999999.99` on service and generate-bills; stored `decimal(10,2)`
(rounded half-up to 2 dp, e.g. 1234.567 → 1234.57); payable paisa = `round(amount × 100)`. Currency is the
community currency (PKR for Pakistan); KuickPay always charges PKR.

**UC-A6 — Decimal precision** — paisa integers end-to-end on attempts; AN14 / plain-paisa parsing for KP payloads.

**UC-A7 — Correct links** — attempt stores `community_id`, `unit_id`, `user_id`, `payable_type/id`; title and subtitle
are copied from the bill at initiation.

**UC-A8 — Zero amount** — a bill with no amount due cannot be paid online (`nothing_due`).

**UC-A9 — Vacant unit (current behaviour, documented, not changed)**
- Automatic bills **are generated** for vacant residential units with no billing contact (accrued to the unit).
- They are **hidden**: nobody can list or pay them (no payer).
- When the first resident becomes billing contact they are **deferred to that resident**: `attachCurrentBillingContacts`
  assigns unpaid vacancy-period bills to the new contact.
- This is an accounting decision the product owner must confirm (see fixes doc, open item O-1). Havena does not
  suppress or prorate them.

**UC-A10 — Move-in / move-out / reassignment / multiple residents**
- Only the effective billing contact sees and pays unit service bills; other residents see "ask your billing contact".
- On reassignment, unpaid/overdue/acknowledged/rejected bills move to the new contact **with the previous contact's
  proof, payment reference and notes cleared**; a rejected bill returns to unpaid/overdue.
- Bills with a proof **under review** or an **active online payment** stay with the resident who started them.
- KuickPay history is per payer (`payment_attempts.user_id`), so a new resident never sees the previous one's payments.

**UC-A11 — Edit / cancel / delete restrictions**
- Price changes apply to the next cycle only; issued bills are immutable through the API.
- A service whose bills have active, succeeded or refund-pending KuickPay payments **cannot be deleted** (set it inactive).
- Unsubscribe/decline never deletes a bill with an active payment attempt.
- Proof approve/reject only applies to `pending_verification`; a KuickPay-paid bill cannot be rejected.

### B. Bill visibility and access

**UC-B1 — Resident scope** — service bills filter `billing_contact_user_id = me`; amenity bills `user_id = me`;
utility bills by active unit membership. Payment detail/cancel filter `user_id = me` → 404 otherwise.
**UC-B2 — Community admin scope** — admin endpoints resolve the community from `AdminRoleService` scope; another
community's payment → 404, list → empty.
**UC-B3 — System admin** — follows `resolveAdminCommunityScope` (header-selected community).
**UC-B4 — Modified IDs** — unknown, foreign or wrong-type `payable_id` → identical 404 `bill_not_found`;
foreign `community_id` → 422 (membership must be approved).
**UC-B5 — Displays** — unpaid, acknowledged, pending verification, paid, overdue, rejected; online status chips:
"Payment processing — tap to view", "Paid online". Cancelled/expired appear in payment history, not on the bill.
**UC-B6 — Lists** — payment history paginates (`per_page` 5–50), filters `all|succeeded|pending|unsuccessful`,
admin ledger adds `attention`, type and search. Apps refetch on focus and pull-to-refresh; status reads use
`cache: no-store`.

### C. Pay Now and initiation

**UC-C1 — Initiate** — valid unpaid bill → 201 `outcome=redirect`, `next_action.url` (launch URL), status
`awaiting_payment`, `expires_at` (+30 min).
**UC-C2 — Server-side amount** — the request carries no amount; any `amount` field is ignored; optional
`expected_amount_paisa` only guards against a stale screen (409 `amount_changed` with the real amount).
**UC-C3 — Ineligible bills** — paid → `already_paid` (no charge); proof under review, needs acknowledgement,
inactive, blocked → 422 with a resident-safe message; zero → `nothing_due`.
**UC-C4 — Repeated taps / tabs / concurrent** — cache lock per bill + DB nullable-unique `active_lock`; same payer
and amount resumes the same checkout; another unit resident → 409 `payment_in_progress`; in-flight → `processing`.
**UC-C5 — Provider references** — `reference` = `provider_order_id` = `HVN-yymmdd-XXXXXX` (unique);
`provider_session_id` from KP; `provider_transaction_id` from the return.
**UC-C6 — Provider failures** — missing credentials → `payments_unavailable` (no HTTP call); 401 →
`payments_unavailable`; malformed / non-00 / 429 / 5xx → `checkout_unavailable`; timeout → `provider_unavailable`.
Attempt marked `failed`, lock released, resident told they were not charged (no checkout ever opened).
**UC-C7 — Timeout after KP may have accepted** — for Checkout the resident has not been sent anywhere, so no charge
is possible. For BillPaymentV3 a timeout or `05`/`03` is `pending_confirmation`, never failed and never retried.
**UC-C8 — Return to app** — `openAuthSessionAsync(launchUrl, havena://screens/payment-result)`; the result screen
polls `GET /payments/{id}?sync=1` (2 s for 90 s, then 8 s) and on app foreground. The URL `status` parameter is ignored.
**UC-C9 — Cancel / back / app closed** — closing the browser leaves the attempt `awaiting_payment`; reopening
shows "Continue payment"/"Cancel payment"; cancel first asks KP for status (if supported) before cancelling.
**UC-C10 — Sandbox safety** — the built-in sandbox is refused when `APP_ENV=production` unless
`KUICKPAY_ALLOW_SANDBOX_IN_PRODUCTION=true`.

### D. Verification and callbacks

**UC-D1 — Outcomes** — `SUCCESS`+`00` → authorise → settle; `FAILED` → failed; `CANCELLED` → cancelled; any
other signed status → `pending_confirmation` + reconciliation; session expiry → expired.
**UC-D2 — Authentication** — Checkout return: signature (assumed algorithm, see §1). Institution: username/password
headers, constant-time compare. Nothing else is trusted.
**UC-D3 — Invalid / unknown / malformed** — unknown payment id → 404 page; order id mismatch → event only; bad
signature → event only; non-UUID → 404 route.
**UC-D4 — Amount check** — signed amount ≠ attempt amount → held in `pending_confirmation`, `needs_attention`,
admins notified; bill not settled.
**UC-D5 — Duplicates** — replayed returns are no-ops (`return_replayed`); duplicate institution `tran_auth_id` → `03`
with the original reference.
**UC-D6 — Delayed / out of order** — a signed success after local cancel/expiry/failure is applied if the bill is still
unpaid, otherwise moved to `refund_pending`; a failure after success changes nothing.
**UC-D7 — Retry after app failure** — a crash between authorisation and settlement leaves `authorized`;
reconciliation settles it after 1 minute.
**UC-D8 — Never trust the frontend** — bills change only inside `PaymentOrchestrator::succeed` / institution payment.

### E. Consistency, concurrency, reconciliation

**UC-E1** DB failure after KP success → recovered (UC-D7). **UC-E2** Missing return but KP reports success →
recovered only where a status inquiry exists (sandbox: yes; live: **blocked**, endpoint undocumented).
**UC-E3** Resident back before the return → result screen shows processing/awaiting and keeps polling.
**UC-E4** Return and reconciliation together → both take the per-attempt lock; settlement is guarded by
`SELECT … FOR UPDATE`. **UC-E5** Two attempts both succeed → the second is recorded as `refund_pending` +
`needs_attention`, never discarded. **UC-E6** No automatic retries of BillPaymentV3; reconciliation uses
BillInquiryV3 only.

### F. Receipts, history, notifications

**UC-F1** Receipt only for `succeeded`: reference, KP transaction id, receipt id, paid to (community), payer,
method, channel, paid-at. **UC-F2** Access: payer or the community's admins. **UC-F3** History survives restarts
(server-side). **UC-F4** Exactly one resident and one admin notification per confirmed payment.
**UC-F5** Notification/audit failures are logged and never undo the payment. **UC-F6** Logs carry payment ids,
response codes and HTTP status only — no secrets, consumer numbers or card data.

### G. Special payment rules

| Rule | Supported? | Behaviour |
|---|---|---|
| Partial payment | No | Amount is the full payable amount; KP amount mismatch is held for review |
| Overpayment | No | Same as above |
| Discounts / taxes | No | Not modelled on bills |
| Late fees | Utility only | Provider `amount_after_due_date` applies after due date; Havena bills have none |
| Refunds | Manual record only | `refund_pending` → admin "Mark refunded" (KP refunds outside Havena) |
| Reversals | Status exists, no flow | `reversed` reserved; no API sets it |
