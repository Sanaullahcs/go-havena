# Plaid (US Bank Payments) — System Admin Setup and Operations

Audience: Havena System Admins and the engineer who operates the server. Applies to the code in this repository as of
2026-10-07 (not yet deployed).

> **Not production-ready.** Payout timing and refunds depend on the Havena Plaid Ledger having available funds,
> which Plaid Sandbox showed it does not have at the moment a resident pays (see "Known limits" below and
> `plaid-fixes-and-results.md` D-1). Do not enable live Plaid in production until those decisions are made.

## 1. How money moves

1. A resident in an eligible US community links a bank (Plaid Auth) and pays an amenity booking fee or a shared amenity bill.
2. Havena asks Plaid to authorize and create an **ACH debit** from the resident into **Havena's Plaid Ledger**.
3. Havena then asks Plaid to send an **ACH credit** (payout) from the ledger to the community's linked bank.
4. Plaid reports progress as transfer events. Havena applies them; nothing else can mark a payment paid.

Havena (the Plaid client) holds funds in its ledger between steps 2 and 3. Statements such as "Havena never takes the
funds" are not accurate and were removed from the dashboard.

## 2. Server configuration (`backend/.env`)

| Variable | Required | Meaning |
|---|---|---|
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | yes | From Plaid Dashboard → Keys. Server only. Never paste in tickets or the frontend. |
| `PLAID_ENV` | yes | `sandbox` (test money) or `production`. |
| `PLAID_TRANSFER_ENABLED` | default `true` | **Global kill switch for new payments.** Webhooks/sync/reconcile keep running. |
| `PLAID_TRANSFER_SIMULATE` | default `false` | Test-only fake transfers without Plaid calls. Ignored when `PLAID_ENV=production`. Never set on UAT/production unless you intend fake payments. |
| `PLAID_ALLOW_SANDBOX_IN_PRODUCTION` | default `false` | When `APP_ENV=production` and Plaid is not in production mode (or simulated), payments are **refused** unless this is `true`. Set `true` only for a deliberate demo site where no real bill can be "paid" with test money. |
| `PLAID_WEBHOOK_URL` | yes for live | `https://<api host>/api/v1/plaid/webhook`, also passed in Link tokens. |
| `PLAID_VERIFY_WEBHOOKS` | default on in production | Verifies Plaid's signed JWT. Keep on anywhere reachable from the internet. |
| `PLAID_SUPPORTED_COUNTRY_CODES` | default `US` | `PK` is always excluded. |
| `PLAID_TRANSFER_STALE_MINUTES` | default 5760 (4 days) | When an unresolved payment is listed as stale. |
| `PLAID_ACH_CLASS_DEBIT` / `_CREDIT` | `web` / `ccd` | ACH SEC codes sent to Plaid. |
| `PLAID_CA_BUNDLE` | optional | CA file for hosts with a broken curl CA store. |

After changing `.env`: `php artisan config:clear` (or `config:cache`).

Check without exposing secrets:

```
php artisan plaid:status
```

Required scheduler entries (already in `bootstrap/app.php`; the server must run `php artisan schedule:run` every minute):

| Command | Frequency | Purpose |
|---|---|---|
| `plaid:sync-events` | every 5 min | Pull Plaid transfer events from the stored cursor |
| `plaid:reconcile` | hourly | Re-read unresolved payments and refunds from Plaid (missed webhooks) |

Migration for this release: `php artisan migrate --force` (adds lifecycle columns, `plaid_transfer_events`, pause fields,
and changes `plaid_transfers` foreign keys so deleting a community/user can no longer delete payment history).

## 3. The System Admin page: *US Bank Payments* (`/admin/bank-payments`)

### Header badges
- **Production** / **Plaid sandbox** / **Simulated (no Plaid calls)** — what mode the server is in.
- **New payments off** — `PLAID_TRANSFER_ENABLED=false`.
- **Sandbox blocked on live site** — `APP_ENV=production` with test Plaid; payments refused.
- **Sync Plaid events** — runs the event sync now (rate-limited).

### Server configuration card
Shows only whether each item is set (client id + secret, transfers enabled, webhook URL, signature verification,
app/Plaid environment). It never shows values.

### Webhook & sync health card
Last webhook received, last webhook failure, last event sync, event cursor, and the number of Plaid events that did not
match any Havena payment. Rising unmatched events or an old "last event sync" means investigation is needed.

### Communities table
| Column | Meaning |
|---|---|
| Bank | Institution and last four digits, or `not connected` / `needs attention` / `error` / `disconnected` |
| Payments | **Ready** only if: eligible country, community active, Plaid configured, payments enabled globally, not blocked as sandbox-on-live, not paused, and the bank is connected. Otherwise the reason is shown. |
| Open | Payments still authorizing, processing or posted |

"Bank connected" alone does **not** mean ready.

**Pause / Resume** (requires a reason of at least 5 characters, recorded in Activity Logs):
- Pause stops **new** payments for that community immediately.
- Payments already started keep updating from Plaid (settlements, returns, refunds).
- Use it while a payout account change is being reviewed, during a dispute with the community, or when a community is suspended.
  (A community whose status is not `active` is already blocked automatically.)

### Payments list
Filters: All, Pending, Posted/settled, Failed, Returned, Cancelled, Refunds, **Needs review**, Stale; community; search
by resident name/email or any Plaid id (debit, payout, refund, authorization) or Havena id.

Each row shows source → destination masks, the Plaid ids, payout status and any exception.

- **Refresh** asks Plaid (`/transfer/get`) for the debit, payout and refund state and applies it. It cannot set a status itself.
- **Mark reviewed** closes an exception with a required note. **It does not change the payment status**, the bill or
  the booking. Use it after you have acted outside Havena (for example in the Plaid Dashboard).

There is intentionally **no** button to mark a payment paid, settled or refunded, to issue a manual refund, or to delete
a payment.

## 4. Exception codes and what to do

| Code | Meaning | Action |
|---|---|---|
| `outcome_unknown` | Plaid approved the debit but did not confirm it was created (timeout/5xx). The charge stays pending and the resident cannot retry. | Do **not** ask the resident to pay again. Wait for the next event sync, or look up the authorization in the Plaid Dashboard. Once Plaid's events arrive it resolves automatically. |
| `payout_failed` | The credit to the community was declined, not sent, failed or returned. The resident's debit stands. | Check ledger balance and the community account in Plaid. Send the payout from the Plaid Dashboard if appropriate, then Mark reviewed with the Plaid id. |
| `payout_recovery_required` | Havena paid the community but the resident's money did not stay (returned, cancelled, or refunded). Havena's ledger is short. | Recover from the community per your agreement; record it in the note. |
| `refund_failed` | Plaid rejected or failed/returned the refund (e.g. insufficient ledger balance, closed account). The resident has **not** been refunded. | Fund the ledger or arrange another refund method; record in the note. |
| `refund_outcome_unknown` | No confirmation from Plaid for a refund request. | Click Refresh: Havena adopts the refund from `/transfer/get` if Plaid created it. Do not retry blindly. |
| `refund_required` | A charge was cancelled but the payment could not be cancelled or refunded automatically (e.g. not yet posted and no longer cancellable). | Refund after it posts, from the Plaid Dashboard; then Mark reviewed. |
| `returned_while_refunded` | The debit was returned while a refund was pending/settled; the resident may receive money twice. | Cancel the refund in Plaid if still possible (`/transfer/refund/cancel` before it is submitted), otherwise recover from the resident. |
| `duplicate_collection` | Money arrived for a charge already paid another way. | Refund the duplicate from the Plaid Dashboard; Mark reviewed. |

## 5. Community onboarding

1. The community's country must be supported (US). Pakistani communities use KuickPay and never see Plaid.
2. The **community admin** (membership role `admin`; moderators cannot) opens **Plaid** in their dashboard and connects
   the receiving account with Plaid Link. Tokens and account numbers stay on the server.
3. The System Admin confirms on *US Bank Payments* that the community shows **Ready**.
4. Residents link their own bank from the mobile app or web portal when they first pay by bank.

Replacing the receiving account: the community admin uses **Replace bank**. Havena exchanges the new connection first
and only then removes the old one; if the new link fails, the old account stays connected. Activity Logs record the
old and new last-four digits, the actor, time, optional reason and the number of payments still in progress. Payments
already in progress at Plaid continue to the account they were created with. Consider pausing the community while you
verify a replaced account (there is no built-in approval step; D-2).

## 6. Cancellations, refunds and returns (what actually happens)

| Event | Trigger | What Havena does | What the resident sees |
|---|---|---|---|
| Cancel before submission | Resident cancels a reservation or the approver declines it while Plaid still allows cancellation | Cancels the debit at Plaid, and the payout if still cancellable | "Bank payment cancelled" |
| Refund | Same triggers after the debit posted | Requests a **full** refund at Plaid; shows **Refund pending** until Plaid reports settled | "Refund pending", then "Refund sent" |
| Refund failure | Plaid rejects/fails/returns the refund | Records `refund_failed`; never shows "Refunded" | Refund failed |
| Return | Resident's bank returns the debit (R01, R02, R10, …) | Marks returned with code, reopens the bill **only if this payment was the one on record**, flags payout recovery if paid out | "Bank payment returned"; bill unpaid again |
| Dispute | Resident disputes with their bank | Arrives as a return (e.g. R10); no separate dispute workflow | As return |

Not supported in Havena today: partial refunds, refunds for shared amenity bills, manual System Admin refunds,
Plaid Guarantee, return recovery (`/transfer/return/recover`).

## 7. Permissions summary

| Role | Can |
|---|---|
| System Admin | View all communities' bank status/readiness and payments, pause/resume with reason, refresh from Plaid, sync events, record review notes. Cannot link a bank, change a status, refund, or delete payments. |
| Community Admin (role `admin`) | Connect, reconnect, replace, disconnect the community bank; view their community's payments. |
| Moderator | View the connection status only. |
| Resident | Link own bank, pay own charges, view own payments. |
| Guest / unauthenticated | Nothing. |

## 8. Known limits before production

- Payout is sent immediately; Plaid Sandbox declined it for lack of ledger balance. Decide when to pay out (D-1).
- Refunds draw from the ledger available balance and were rejected in Sandbox for the same reason.
- No Nacha/Plaid authorization (mandate) text is shown or stored for resident debits (D-3).
- No approval step for new/replaced payout accounts (D-2); no limits or two-person approval (D-5).
- Webhook signature verification is implemented and tested with generated keys, but has not received a real Plaid webhook (needs a public URL).
