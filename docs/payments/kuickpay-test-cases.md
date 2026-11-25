# KuickPay Payments — Test Cases

**Run date:** 2026-10-07 · **Environment:** PHPUnit / PHP 8.2, `havena_test` MySQL, `CACHE_STORE=array`, Windows dev box.
**Provider:** every automated test uses either the **built-in sandbox simulator** (`KuickpaySandboxGateway`, labelled
*Mock-SBX*) or **Laravel `Http::fake` fixtures** copied from the KuickPay docs (*Mock-HTTP*). **No test ran against the
real KuickPay UAT sandbox** — Havena has no KuickPay credentials yet. Manual browser checks used the local API with the
simulator (*Local-SBX*).

Status meanings: **Pass** = executed and expected result verified · **Blocked** = needs KuickPay UAT, credentials,
or an undocumented provider API · **Not run** = possible but not executed in this pass.

Files: `F1` = `tests/Feature/KuickpayPaymentsTest.php`, `F2` = `tests/Feature/KuickpayPaymentsReviewTest.php`,
`U1` = `tests/Unit/KuickpayHttpGatewayTest.php`, `PSB` = `tests/Feature/PropertyServiceBillingTest.php`.

## Matrix

| Test ID | UC | Scenario | Pri | Preconditions | Test data | Steps / request | Expected | Actual | Result | Evidence | Fix |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-A01 | A1 | Automatic service bills units, contact only notified | P1 | PK community, 2 residents in one unit | Maintenance Rs 2,500 | Create service | 1 bill/unit, contact notified | As expected | Pass | PSB `test_automatic_service_bills_units_and_notifies_billing_contact_only` | — |
| TC-A02 | A2 | Recurring bills follow schedule / inactive stops | P1 | Automatic service | first month 2026-09 | Toggle inactive, run job | No new bills while inactive | As expected | Pass | PSB `test_inactive_service_stops_new_bills_…` | — |
| TC-A03 | A3 | Duplicate period not created | P0 | Service exists | period 2026-11 | Generate twice | `created_count` 1 then 0; 1 row | As expected | Pass | F2 `test_tc_a03_…` | — |
| TC-A04 | A4 | Required fields | P2 | Admin | missing first month | Create automatic service | 422 | As expected | Pass | PSB `test_admin_property_services_include_all_schedule…` | — |
| TC-A05 | A5 | Amount 0, -5, 1,000,000, "abc" rejected; 1234.567 → 1234.57 | P0 | Admin | listed | POST service | 422 ×4; stored 1234.57 | As expected | Pass | F2 `test_tc_a05_…` | — |
| TC-A06 | A6 | AN14/plain paisa, YYMM/MMYY parsing | P1 | — | `0000000250000+`, `25000`, `2506`, `0525` | Unit parse | 250000 / 25000 / 2025-06 / 2025-05 | As expected | Pass | F1 `test_formats_…`, U1 `tc_u01` | — |
| TC-A07 | A7 | Attempt linked to community/unit/user/bill | P1 | Bill | Rs 5,000 | Pay Now | columns populated | As expected | Pass | F1 happy path | — |
| TC-A08 | A8 | Zero-amount bill cannot be paid | P1 | Bill Rs 0 | — | POST /payments | 422 `nothing_due` | As expected | Pass | F2 `test_tc_a08_…` | D-6 |
| TC-A09 | A9 | Vacant unit bill hidden, then deferred to first resident | P0 | Vacant unit C-303 | Rs 1,000 | Generate, list, pay, move in | Hidden, 404 to others, appears for newcomer | As expected (documents current behaviour) | Pass | F2 `test_tc_a09_…` | Open O-1 |
| TC-A10 | A10 | Second resident is not billing contact | P1 | 2 residents | — | GET /units/mine | Only first is contact | As expected | Pass | PSB `test_first_resident_becomes_billing_contact…` | — |
| TC-A11 | A10 | Move-out keeps previous proof/online payment private | P0 | Alice: proof pending, rejected bill, in-flight payment | — | Move Alice, add Bob, Bob lists bills | Bob sees only rejected bill, proof cleared, status unpaid, no Alice data | As expected | Pass | F2 `test_tc_a11_…` | D-3 |
| TC-A12 | A11 | Service with KuickPay payments cannot be deleted | P0 | Paid via KP | — | DELETE service | 422, bill kept | As expected | Pass | F2 `test_tc_a12_…` | D-4 |
| TC-A13 | A11 | Price change applies next cycle only | P2 | Bill exists | 40 → 75 | PATCH service | old bill 40 | As expected | Pass | PSB `test_service_price_change_applies_to_next_cycle_only` | — |
| TC-B01 | B1 | Other resident cannot pay/see/cancel | P0 | Bill of Zainab | Stranger | POST pay, GET, cancel | 404 ×3 | As expected | Pass | F1 `test_other_residents_cannot_see_or_pay…` | — |
| TC-B02 | B2 | Admin of another community gets 404 / empty list | P0 | Paid payment in Tower 1 | Admin Tower 3 | GET detail, list | 404, 0 rows | As expected | Pass | F1 `test_admin_ledger_is_scoped…` | — |
| TC-B03 | B4 | Cross-community resident & `community_id` spoof | P0 | Two communities | — | pay A's bill; `?community_id=A` | 404; 422; no attempt | As expected | Pass | F2 `test_tc_b04_…` | — |
| TC-B04 | B4 | Amenity bill of another resident / bad type | P0 | Owner's bill | Neighbour | POST pay | 404; 422 | As expected | Pass | F2 `test_tc_b05_…` | — |
| TC-B05 | B1 | Non-contact cannot pay unit bill | P0 | Two residents | Maria | subscribe/pay | 422/404 | As expected | Pass | PSB optional-service tests; F2 TC-A11 | — |
| TC-B06 | B6 | History filters & pagination | P2 | 3 attempts | 2 paid, 1 open | GET /payments with filters | 3 / 2 / 1 / page 2 empty, total 3 | As expected | Pass | F2 `test_tc_f03_…` | — |
| TC-B07 | B5 | Mobile/web status chips render | P2 | Device | — | Visual | Chips per state | — | Not run | — | — |
| TC-C01 | C1 | Happy path: Havena service bill | P0 | Unpaid bill | Easypaisa 03001234567 | Pay → launch → sandbox → return | Paid, receipt, notifications | As expected | Pass | F1 `test_service_bill_happy_path…` | — |
| TC-C02 | C2 | Client amount ignored | P0 | Bill Rs 5,000 | `amount=1`, `amount_paisa=100` | POST /payments | attempt 500000 paisa | As expected | Pass | F2 `test_tc_c06_…` | — |
| TC-C03 | C2 | Stale amount → 409 | P0 | Bill Rs 5,000 | expected 100 | POST /payments | 409 `amount_changed`, real amount in meta | As expected | Pass | F2 `test_tc_c06_…`; F1 utility 4444 | — |
| TC-C04 | C3 | Already-paid bill never charged | P0 | Paid bill | — | Pay again | `already_paid`, 1 attempt total | As expected | Pass | F1 happy path tail | — |
| TC-C05 | C4 | Double tap resumes same checkout | P0 | Bill | — | POST ×2 | same id, 1 row, `checkout_resumed` | As expected | Pass | F1 `test_double_tap…` | — |
| TC-C06 | C4 | DB refuses two active attempts | P0 | Bill | same `active_lock` | insert ×2 | QueryException | As expected | Pass | F2 `test_tc_e07_…` | — |
| TC-C07 | C4 | In-flight attempt → `processing`, no new charge | P0 | pending_confirmation | — | POST /payments | `processing` | As expected | Pass | F2 TC-A11 setup; F1 expiry test | — |
| TC-C08 | C6 | Create Session signed, documented fields | P0 | UAT config | Rs 1,250 | Mock-HTTP | Basic auth, HMAC hex, `1250.00`, ISO timestamp | As expected | Pass | U1 `tc_c09` | — |
| TC-C09 | C6 | 401 / malformed / non-00 / 429 / timeout | P0 | UAT config | fixtures | Mock-HTTP | resident-safe codes, no secret in message | As expected | Pass | U1 `tc_c10` | — |
| TC-C10 | C6 | Missing credentials never call KP | P1 | empty key | — | Mock-HTTP | exception, nothing sent | As expected | Pass | U1 `tc_c09_missing…` | — |
| TC-C11 | C9 | Cancel & decline leave bill unpaid, retry allowed | P1 | Bill | cancel; wallet …0000 | sandbox | cancelled/failed, new attempt works | As expected | Pass | F1 `test_cancel_and_decline…` | — |
| TC-C12 | C9 | Abandoned checkout expires; truthful message | P1 | Attempt | +31 min | GET status | `expired`, no "not charged" claim | As expected | Pass | F2 `test_tc_e05_…` | D-7 |
| TC-C13 | C10 | Sandbox refused in production | P0 | `APP_ENV=production`, mode sandbox | — | capability, pay, sandbox page | provider null, 422, 404; opt-in flag re-enables | As expected | Pass | F2 `test_tc_c13_…` | D-1 |
| TC-C14 | C8 | Mobile deep-link return & polling | P0 | Device + build | — | Pay on iOS/Android | Result screen polls server | — | Not run | — | — |
| TC-C15 | C8 | Hosted page renders, validates, returns | P1 | Local API | Rs 4,200 bill | Browser at 400 px | Page, inline error, paid bill, return page | As expected | Pass | Local-SBX screenshots (previous session) | — |
| TC-C16 | C6 | Real Create Session against KuickPay UAT | P0 | UAT credentials | — | Live call | session + redirectURL | — | Blocked | No credentials | — |
| TC-D01 | D2 | Signature verify valid/tampered/empty/no key | P0 | — | fixtures | Unit | true / false ×3 | As expected | Pass | U1 `tc_d01` | — |
| TC-D02 | D3 | Forged return (bad signature) | P0 | Attempt | signature `aaa…` | GET return | no change, `return_signature_invalid` | As expected | Pass | F1 `test_forged_and_replayed…` | — |
| TC-D03 | D3 | Unknown id / missing orderid / non-UUID | P0 | Attempt | — | GET return | 404 / event only / 404 | As expected | Pass | F2 `test_tc_d03_…` | — |
| TC-D04 | D4 | Signed wrong amount held for review | P0 | Attempt Rs 4,100 | amount 10.00 | GET return | pending_confirmation, needs_attention, bill unpaid | As expected | Pass | F1 `test_forged_and_replayed…` | — |
| TC-D05 | D1 | Unsupported signed status held | P1 | Attempt | `PROCESSING` | GET return | pending_confirmation | As expected | Pass | F2 `test_tc_d05_…` | — |
| TC-D06 | D5 | Replay after success no-op | P0 | Succeeded | same return ×2 | GET return | `return_replayed` | As expected | Pass | F1, F2 `tc_f05` | — |
| TC-D07 | D6 | FAILED then signed SUCCESS (out of order) | P0 | Attempt | — | returns in order | bill paid; later FAILED ignored | As expected | Pass | F2 `test_tc_d07_…` | D-5 |
| TC-D08 | D6 | Success after expiry applied | P0 | Expired attempt | — | signed success | succeeded, bill paid | As expected | Pass | F2 `test_tc_e05_…` | — |
| TC-D09 | D2 | Institution bad/no credentials, bad date | P0 | — | — | POST bill-payment | `04` | As expected | Pass | F1, F2 `tc_d10` | — |
| TC-D10 | D5 | Institution inquiry/payment/duplicate/amount | P0 | Bill Rs 2,500 | tran 123456 | POST ×n | 00/U, 04, 00, 03, P | As expected | Pass | F1 `test_institution_…` | — |
| TC-D11 | D5 | Institution blocks bill with in-flight Havena payment | P0 | pending_confirmation | — | inquiry, payment | `02`/`B`, bill unpaid | As expected | Pass | F2 `test_tc_d10_…` | — |
| TC-D12 | D2 | Real KuickPay return signature format | P0 | UAT | — | Live return | verifies | — | Blocked | Algorithm undocumented | — |
| TC-D13 | D2 | Institution connectivity from KuickPay UAT | P0 | Public HTTPS + creds | — | KP Integration Setup tool | 00 responses | — | Blocked | Needs onboarding | — |
| TC-E01 | E1 | DB failure during settlement recovered | P0 | Attempt | injected exception | return, +2 min reconcile | authorized → succeeded, 1 notification | As expected | Pass | F2 `test_tc_e01_…` | — |
| TC-E02 | E2 | Return missing, KP reports success (sandbox) | P0 | Sandbox status | — | cancel → status check | settles instead of cancelling | As expected (sandbox only) | Pass | F1 cancel path; orchestrator `cancel()` | — |
| TC-E03 | E2 | Return missing, live KP status inquiry | P0 | Live | — | reconcile | settles | — | Blocked | Status API undocumented | — |
| TC-E04 | E5 | Two attempts both succeed | P0 | A cancelled, B paid | — | late A success | A refund_pending + needs_attention; bill keeps B | As expected | Pass | F2 `test_tc_e04_…` | — |
| TC-E05 | E6 | Utility unknown outcome reconciled, not retried | P0 | LESCO …3333 | — | pay, reconcile | processing → succeeded, 1 attempt | As expected | Pass | F1 `test_unknown_biller_outcome…` | earlier fix |
| TC-E06 | E6 | Biller rejection after charge → refund | P0 | GEPCO …5555 | — | pay | refund_pending, admin can record refund | As expected | Pass | F1 `test_biller_rejection…` | — |
| TC-E07 | E6 | BillPaymentV3 timeout / 05 / 03 = unknown | P0 | Live client | fixtures | Mock-HTTP | `unknown`, request fields correct | As expected | Pass | U1 `tc_e09` | — |
| TC-E08 | E4 | True parallel return + reconcile | P1 | Two PHP workers | — | concurrent HTTP | one settlement | — | Not run | Needs multi-process harness; guarded by lock + row lock | — |
| TC-F01 | F1 | Receipt only after success; owner/admin only | P0 | Attempt | KPRCPT | before/after; other users | null → receipt; 404 neighbour; admin OK | As expected | Pass | F2 `test_tc_f01_…` | — |
| TC-F02 | F4 | One notification per confirmed payment | P0 | Success | replay + re-entry | count | 1 resident, 1 admin, 1 review row | As expected | Pass | F2 `test_tc_f05_…` | D-2 |
| TC-F03 | F5 | Notification failure doesn't undo payment | P1 | — | — | Code review | follow-ups wrapped; `NotificationService` swallows | Verified by review | Pass (review) | `PaymentOrchestrator::succeed` | D-2 |
| TC-F04 | F6 | No secrets in errors | P0 | 401/timeout fixtures | — | Mock-HTTP | message lacks key | As expected | Pass | U1 `tc_c10` | — |
| TC-F05 | F3 | Mobile history after restart | P2 | Device | — | restart app | history loads | — | Not run | — | — |
| TC-G01 | G | Refund only for refund_pending; resident forbidden | P1 | Succeeded | — | POST refunded | 422; 403 | As expected | Pass | F2 `test_tc_g02_…` | — |
| TC-G02 | G | Late fee (utility past due) | P1 | FESCO …2222 | — | link | payable = after-due | As expected | Pass | F1 `test_utility_amount_change…` | — |
| TC-G03 | G | Partial/over-payment rejected (institution) | P0 | Bill Rs 2,500 | paid 100 | POST payment | `04` | As expected | Pass | F1 `test_institution_…` | — |
| TC-U01 | — | Utility link validation, encryption, duplicate | P0 | — | LESCO refs | POST accounts | 422s, encrypted, masked | As expected | Pass | F1 `test_link_utility_account…` | — |
| TC-U02 | — | Utility paid elsewhere → no charge | P0 | SNGPL …1111 | — | pay | `already_paid`, 0 attempts | As expected | Pass | F1 | — |
| TC-U03 | — | Utility happy path | P0 | KE account | bank | pay | paid via havena, receipt | As expected | Pass | F1 | — |
| TC-U04 | — | Inquiry response-code mapping & malformed | P1 | Live client | fixtures | Mock-HTTP | per table | As expected | Pass | U1 `tc_u02` | — |
| TC-U05 | — | Status display mapping | P2 | — | all statuses | Unit | per table | As expected | Pass | U1 `tc_u03` | — |
| TC-U06 | — | Real BillInquiry/BillPayment & funding flow | P0 | UAT | — | Live | — | — | Blocked | Spec §28 provider question | — |
| TC-R01 | — | Regression: billing, amenity, Plaid suites | P0 | — | — | full suites | all pass | 75 pass | Pass | PSB, AmenitySharedBillTest, Plaid tests | — |

## Totals (this pass)

| | Count |
|---|---|
| Matrix rows | 72 |
| Pass (automated, executed) | 61 |
| Pass (local browser / code review) | 2 (TC-C15, TC-F03) |
| Blocked (KuickPay UAT / undocumented API) | 5 (TC-C16, TC-D12, TC-D13, TC-E03, TC-U06) |
| Not run (device / multi-process) | 4 (TC-B07, TC-C14, TC-E08, TC-F05) |
| Failed | 0 |

Automated test methods executed: **47 KuickPay** (8 unit + 17 + 22 feature) and **75 regression** (billing, amenity, Plaid)
→ **122 passed, 0 failed** (1,257 assertions).
