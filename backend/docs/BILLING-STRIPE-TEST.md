# Stripe billing — local test setup

Community admins purchase a **Starter / Growth / Campus** plan. Seats are consumed when residents are invited or approved. Guests and community admins do not use seats.

## 1. Stripe Dashboard (test mode)

1. Open [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) and enable **Test mode**.
2. Copy **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`).
3. **One-time Checkout polish** (fixes “Neighborlink”, PKR toggle, extra wallets):
   - **Settings → Business details** → Public business name: **Havena**
   - **Settings → Branding** → Havena logo + accent `#0d9488` / brand `#0A2A43`
   - **Settings → Adaptive pricing** → **Off** (API also forces USD per session)
   - **Settings → Payment methods** → **Cards ON**; disable Link, Amazon Pay, Cash App Pay, Apple Pay
   - **Settings → Checkout** → optional support email + terms/privacy links

Hosted Checkout is no longer used for first-time trials. Admins pay on a **Havena checkout page** (`/admin/billing/pay`) with Stripe Payment Element:

- Card number, expiry, and CVC only
- No Apple Pay, cardholder name, or billing address
- Havena teal styling, $0-today trial copy

## 2. Create products & price IDs

From `backend/`:

```bash
php artisan billing:setup-stripe --key=pk_test_... --secret=sk_test_... --write-env
```

Windows (XAMPP):

```powershell
.\scripts\setup-stripe-test.ps1 -PublishableKey pk_test_... -SecretKey sk_test_...
```

This writes to `.env`:

- `BILLING_DRIVER=stripe`
- `STRIPE_KEY`, `STRIPE_SECRET`
- `STRIPE_PRICE_*` for all three plans (monthly + yearly)

Verify:

```bash
php artisan billing:stripe-status
```

Restart the Laravel API after changing `.env`.

## 3. Webhooks (recommended)

Install [Stripe CLI](https://stripe.com/docs/stripe-cli), then:

```bash
stripe listen --forward-to http://localhost:8000/api/v1/billing/stripe/webhook
```

Copy the `whsec_...` signing secret into `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

> Checkout still works without webhooks: after payment, the admin UI calls `POST /v1/admin/billing/confirm-checkout` with the session id.

## 4. Test the flow

Checkout starts a **30-day free trial** (`BILLING_TRIAL_PERIOD_DAYS`) and always collects a card. Access to the dashboard/app still requires **system approval** as well.

1. Log in as **community admin** → setup community (if needed) → **Billing** (`/admin/billing`).
2. Choose a plan → **Start free trial** → Stripe Checkout opens.
3. Pay with test card **4242 4242 4242 4242** (any future expiry, any CVC). You are not charged during the trial.
4. Return URL: `/admin/billing?checkout=success&session_id=...` → then **pending approval** if not yet platform-approved.
5. Subscription status is **trialing** (then **active** after trial); seat limit applies once approved.
6. After system approval, **Members → Invite** should succeed while seats remain.
7. **Manage billing** opens the Stripe Customer Portal (enable it once under Stripe → Settings → Billing → Customer portal).

## 5. Manual bypass (no Stripe)

For quick seat testing without Checkout:

```bash
php artisan billing:grant {community_id} growth
```

Or set `BILLING_DRIVER=manual` in `.env`.

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/billing` | Dashboard payload |
| POST | `/api/v1/admin/billing/checkout` | Start Checkout |
| POST | `/api/v1/admin/billing/confirm-checkout` | Confirm after redirect |
| POST | `/api/v1/admin/billing/portal` | Stripe Customer Portal |
| POST | `/api/v1/admin/billing/change-plan` | Upgrade/downgrade |
| POST | `/api/v1/billing/stripe/webhook` | Stripe events |
