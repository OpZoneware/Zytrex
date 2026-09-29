# Zytrex AI Finance

A sandbox financial workspace with a command bar, payments, approvals, beneficiaries, transaction history and an audit trail.

## Design

The workspace uses navy navigation, sea-glass accents, a prominent account balance, cash-flow chart and a compact approval queue. Marco's public site informed spacing and visual hierarchy; the interface and code are Zytrex's own. Payment tasks open focused screens rather than chat bubbles.

## Run

Use Node.js 22 and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Select a demo role. The sandbox PIN is `123456`.

```sh
npm run lint
npm test
npm run build
npm start
# In a separate terminal, with the app running on 127.0.0.1:3000:
npx playwright install chromium
npm run test:ui
```

GitHub Actions performs lint, domain checks, a production build, and browser checks at desktop and 390/320px widths. Screenshots are uploaded as `zytrex-ui-evidence`.

## Try the payment journey

1. Enter as Daniel (CEO).
2. Type `Pay Godwin Engineering 520k for LASCON` in the command bar.
3. Review details, then Continue.
4. Explicitly switch the simulated role to Amara, then click Approve payment.
5. Review amount, fee and balance after; authorize with demo PIN `123456`.
6. View the receipt. The balance is debited by ₦520,050.

Other commands: `What is our balance?`, `Show pending approvals`, `How much did we spend this month?`, `Show transactions above 1m`.

Voice input fills the command bar for review before submission. Availability depends on browser support and microphone permission.

## Controls implemented

- Opaque HttpOnly, SameSite browser cookies isolate demo identities and data between browsers.
- Every API route uses the sandbox context; cross-origin mutations are rejected.
- Unknown action names are rejected; cancellation goes through the payment service.
- A requester cannot approve their own payment. Finance + CEO requirements need separate role approvals.
- Execution checks beneficiary verification, expiry, current policy requirements and available funds including fees.
- Funds are reserved before gateway dispatch; concurrent payments cannot overspend one balance within a process.
- Money inputs are limited to kobo precision; arithmetic is performed in integer kobo at the reservation/debit boundary.
- Unknown gateway outcomes retain reservations and cannot be retried blindly.
- Role switches and wrong PINs are recorded. Reset retains audit history inside the browser session.
- Persistent sandbox labels, focus-contained dialogs, scrollable payment panels and keyboard command suggestions.

## Deliberate sandbox limits

This is **not a production banking system**. Role selection and the public PIN simulate authorization. There is no real identity provider, bank verification, real payment rail, durable ledger, webhook reconciliation or production secrets manager.

The store is in memory, scoped to a browser sandbox with an eight-hour idle lifetime; process restart clears it. Run the demo on **one long-lived Node process**. A multi-instance/serverless Vercel deployment needs a shared persistent store first; simply deploying this build does not provide durable sessions or payments. `PAYMENT_MODE` values other than `sandbox` are rejected by API routes.

The display/report clock is pinned to 29 September 2026. Business-hour policy uses the same scenario clock in Lagos time; expiry uses actual elapsed time. New beneficiaries remain unverified and cannot receive a simulated payment until a verified fixture or a real verification workflow exists.

The command engine is deterministic, not an LLM. Production AI should propose structured intents and use these server-side policy checks; it must never approve or execute payments.

## Next milestones

1. Add real authentication, organization isolation and shared persistent storage.
2. Replace mutable balances with a durable transactional ledger, reservations and fee entries.
3. Add transaction-bound passkey/step-up authorization, idempotency, provider reconciliation and append-only durable audit events.
4. Integrate the actual Zytrex Payments sandbox and verify delayed/duplicate/out-of-order provider events.
5. Add structured LLM intent parsing, deeper reporting and production monitoring.
