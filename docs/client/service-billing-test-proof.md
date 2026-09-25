# Service & Service Bill — Test Proof

**Run date:** 2026-09-22  
**Environment:** PHPUnit 10.5 / PHP 8.2.12 / `havena_test` database

## Backend — PropertyServiceBillingTest

```
OK (24 tests, 349 assertions)
Time: ~42s
```

Proof file: `backend/storage/app/service-billing-test-proof.txt`

### Use cases covered

| Area | Test | Result |
|------|------|--------|
| Billing contact | First resident becomes contact; second does not | ✔ |
| Automatic service | Bills residential units; notifies billing contact only | ✔ |
| Schedule | Future first billing month skips generation | ✔ |
| Optional service | Subscribe requires billing contact + admin approval | ✔ |
| Resident payment | Acknowledge → proof → reject → re-proof → approve | ✔ |
| **Notices** | Finance notice created on bill; visible on Home | ✔ |
| **Notices** | Notice stays on Home while unpaid/rejected | ✔ |
| **Notices** | After admin approves payment, notice removed from Home | ✔ |
| **Notices** | Paid notice still in Community Updates (`include_expired=1`) | ✔ |
| **Notices** | `send_notice=false` → bill + push notification, no finance notice | ✔ |
| **Notices** | Inactive service → no new bills/notices; reactivate → new notice | ✔ |
| **Notices** | Reactivated bill paid → second notice hidden from Home | ✔ |
| Optional bill | Home notice + billing contact notification | ✔ |
| One-time | Pending subscribe counts + unit bill | ✔ |
| Publish | Create service notifies contacts; subscribe creates bill | ✔ |
| Pricing | Price change applies next cycle only | ✔ |
| Admin CRUD | List / update / delete services | ✔ |
| Units | Office units excluded from automatic billing | ✔ |
| Inactive | No new bills/subscribe; existing records kept; reactivate resumes | ✔ |
| Admin bills | Status filters + overdue marking + acknowledge | ✔ |
| Yearly | Billing year stored; one bill per year | ✔ |

### Notice lifecycle (core flow)

1. **Bill created** → finance notice published to billing contact → appears on Home (`/api/v1/notices`).
2. **Proof submitted** → notice remains on Home; admin notified.
3. **Payment rejected** → notice remains on Home; resident can resubmit proof.
4. **Payment approved** → `event_date` set to yesterday → notice **hidden from Home** but **still readable** in Updates archive and detail API.

## Mobile — Notice home expiry

```
All 14 notice home expiry tests passed.
```

Proof file: `backend/storage/app/notice-home-expiry-proof.txt`

Key service-bill rules validated client-side:

- Undated finance notice → **stays on Home**
- Paid finance notice with past `event_date` → **hidden from Home**
- Carousel / upcoming events exclude expired schedules

## Bugs found

**None** in this run. All 24 backend + 14 mobile notice tests passed without code changes beyond adding two notice edge-case tests:

- `test_service_with_send_notice_disabled_skips_finance_notice`
- `test_inactive_service_notice_rules_and_reactivation_notice_generation`

## Re-run commands

```powershell
cd backend
d:\xampp\php\php.exe vendor/bin/phpunit tests/Feature/PropertyServiceBillingTest.php --testdox

cd ..
node apps/mobile/scripts/test-notice-home-expiry.mjs
```
