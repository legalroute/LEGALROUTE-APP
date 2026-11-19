# Stripe test payments and stored documents

## Included in this version

- **Settings → Billing** dashboard with client-specific one-time USD requests.
- The same requests in each client's **Payments** tab, and the same shared implementation as **Settings → Billing**.
- Stripe-hosted test Checkout. Card information stays with Stripe; LegalRoute does not collect card numbers.
- Verified webhook updates, duplicate-event protection, request idempotency and amount/client/firm checks.
- A public return page that never treats a browser redirect as proof of payment.
- **Upload document** beside **Stored documents** in a client's Documents tab, with a file picker, optional display name, optional pending-document request and success/error feedback.

This is a **test-only integration**, using one operator-configured Stripe test account. Records and pages are firm-scoped, but separate real-money Stripe accounts for law firms are not provisioned. Live API keys are rejected. Before collecting real payments after Azure deployment, add an explicit per-firm Stripe Connect or hosted-link configuration and determine the intended destination accounts. Changing the hosting provider alone does not enable live payments.

## Local Stripe setup

1. In your Stripe Dashboard, select the intended test environment/sandbox and obtain its secret test API key (`sk_test_...`). Use the same Stripe environment for the CLI and API key.
2. Install the [Stripe CLI](https://docs.stripe.com/cli/install), then authenticate:

   ```bash
   stripe login
   ```

3. In a separate terminal, keep webhook forwarding running:

   ```bash
   stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:3000/api/payments/stripe/webhook
   ```

4. Copy the `whsec_...` signing secret printed by that listener. Add these to your existing `legal_route_ai/.env.local`, preserving other settings:

   ```dotenv
   APP_URL=http://localhost:3000
   STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_LISTENER_SECRET
   ```

   No publishable key is needed because this version redirects to hosted Checkout rather than collecting card input in LegalRoute. Never put secret keys in browser code, screenshots, chat or Git. If the listener's signing secret changes, update the environment and restart the app.

5. From the repository root:

   ```bash
   npm install
   npm run db:up
   npm run db:migrate
   npm run dev
   ```

6. Sign in at `http://localhost:3000`, open **Settings → Billing**, choose a client, enter a description and USD amount, and click **Create test payment request**. An attorney or admin account is required to create requests. Firm members can view their firm's requests. The latest 100 requests are shown.
7. Open the returned Stripe test Checkout link. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, and any three-digit CVC. Use fictional test customer information, not a real card. See [Stripe testing](https://docs.stripe.com/testing).
8. Complete Checkout, keep the listener running, and refresh Billing. The verified webhook changes the status to **paid** and records a client activity. Returning to LegalRoute without a valid webhook never marks a request paid. The public return page does not require a LegalRoute login or expose payment records.

Stripe-hosted session links expire; these are not reusable Stripe Payment Links products. No invitation email, invoice or receipt is sent by LegalRoute. Stripe's own account-level email settings are separate. An unfinished create has a retry action that reuses the exact request identity. After 23 hours, creation retries are blocked to avoid reusing an idempotency key after Stripe's retention window; inspect Stripe before creating another request. Paid is terminal in this MVP: refunds, disputes, partial payments, tax, subscriptions, trust accounting and reconciliation beyond Checkout are not implemented.

## Azure deployment later

The app can remain hosted on Azure while Checkout is hosted by Stripe. Set `APP_URL` to the HTTPS application origin and store secrets in Azure's secret/application configuration. Register a public webhook endpoint at:

```text
https://YOUR_DOMAIN/api/payments/stripe/webhook
```

Use its signing secret rather than the local CLI signing secret. Match the endpoint's API version to the Stripe SDK version used by this app (and update/test them together when upgrading). Test endpoints stay in the matching test environment. Stripe sends events independently of the browser; the webhook endpoint must be publicly reachable. Live payment support and per-firm payment routing are a subsequent implementation, not an environment-key switch in this version.

## Upload and download documents

Open **Clients → choose client → Documents → Stored documents → Upload document**. Choose a nonempty file up to 20 MB, optionally set a display name or fulfill a document request, then upload. The list refreshes and shows the stored file with Download and Remove controls. The existing sidebar upload form remains available.

Files are private to authenticated members of the owning firm. The upload endpoint checks the client and document-request scope, enforces a bounded multipart body and per-file size, rejects foreign browser origins, and removes a written file if the database write fails. Concurrent attempts to fulfill the same request return a conflict rather than overwriting an existing file. Downloads use attachment responses and are not publicly addressable.

Storage currently uses local disk under `legal_route_ai/uploads/` during normal web development. This folder is gitignored. For a persistent mount, configure an absolute directory:

```dotenv
DOCUMENT_UPLOADS_DIR=/absolute/path/to/private-documents
```

On Azure, point that variable at a persistent mounted volume and back it up alongside PostgreSQL. This version does not implement Azure Blob Storage, malware scanning, document OCR or encryption at rest in the app. Download permission is enforced by LegalRoute; underlying disk access/backup protection belongs to the deployment configuration.

## Backend model and tests

Migration `0009_stripe_test_payments` creates `payment_requests` (firm/client/user, cents, description, idempotency key, Checkout reference, state/times) and `payment_events` (deduplication IDs associated with their request). Card data and Stripe API secrets are not stored in these tables.

`backend/src/services/payments/service.ts` handles business logic; Next.js actions/routes handle auth, forms and raw signed webhook payloads. Tests use a mocked Stripe gateway, real Stripe signature generation/verification, PGlite migration coverage, and an isolated PostgreSQL/HTTP test. Actual Checkout through your Stripe account requires the private setup above; automated tests do not charge or call a real Stripe account.

The former `/payments` address redirects to `/firm-settings?tab=billing`. Client-specific Payments tabs remain available.
