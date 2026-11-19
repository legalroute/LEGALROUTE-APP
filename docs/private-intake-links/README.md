# Private links for individual intake sessions

The permanent firm URL (`/intake/<firm-slug>`) still starts new intakes. After the client supplies optional contact details, consents to recording and begins, LegalRoute creates a distinct private link for that intake session. A client returning later for another matter gets a separate session and link.

## Client flow

1. Open the firm's intake URL, optionally enter name/email, and choose whether to receive a resume email.
2. Continue to the recording consent screen and begin. No microphone recording starts merely by visiting a link.
3. A **Your private resume link** card appears alongside the conversation. Use **Copy link** to save it.
4. Open that link on another browser/device, click **Open saved intake**, consent and grant microphone access. LegalRoute restores the saved transcript and answer progress, uses the original frozen form, and asks the next unanswered question.
5. Expired, revoked, replaced or closed-session links cannot resume. Once the intake is submitted, declined, reviewed or converted, the public session is closed. A valid completed link does not expose playback/download access.

Links look like:

```text
https://YOUR_DOMAIN/intake/FIRM_SLUG/resume#UNPREDICTABLE_TOKEN
```

The fragment after `#` is intentionally retained in the browser address for bookmarking and refresh. Browsers do not send fragments in HTTP requests or referrer headers. The resume page initially contains only firm branding and generic instructions. It reads the fragment on a deliberate click; the credential is then submitted in the start POST body, and later recording submissions use an Authorization header. No names or emails are placed in the link.

Treat the entire link as private. It is a bearer credential: anyone possessing it can resume and read the session transcript while the session is open. It does not verify that person's identity, provide a client login, or implement email verification. Use HTTPS when deployed. Browser history, clipboard contents and recipients' inboxes can retain the complete link.

## Expiration and firm controls

Credentials expire seven days after issue; resuming does not extend them. Attorneys/admins can open an in-progress template intake under **Intakes**, then use **Private session link → Create replacement link** or **Revoke link**. Replacing yields a new copyable link and invalidates the old one. The original raw token cannot be recovered from the database. Previously started template intakes without a credential can be issued a replacement this way.

Revocation or replacement blocks subsequent requests. An already authorized in-flight recording/AI request may finish. There is no single-device lock: two people with the same link can attempt to resume, so clients should use one recording window at a time. This version restores saved turns and answers, not unsent audio or a microphone recording interrupted before upload.

The feature covers firm template intakes with frozen configs. The standalone legacy `/voice` demo does not issue firm/client links and cannot submit turns for a firm-linked conversation. Start a new firm intake for older sessions without a usable frozen form. Changing a firm's slug changes its URL; replacement links use the current slug, and old-slug links stop resolving.

## Optional email delivery

The client must check **Email me my private intake link when I begin recording** and enter a valid email. Configure these in the existing ignored `legal_route_ai/.env.local`:

```dotenv
APP_URL=http://localhost:3000
RESEND_API_KEY=YOUR_RESEND_KEY
EMAIL_FROM="LegalRoute <intake@YOUR_VERIFIED_DOMAIN>"
```

For deployed clients, use the application's HTTPS public URL; `localhost` links are only usable on the same local machine. Resend sender/domain verification and account delivery limits still apply.

An opted-in new session sends one email after creation. Resume requests do not resend mail. If delivery is unconfigured or fails, the UI warns the client and retains the copyable link. Unconfigured delivery does not call the generic development email logger, so the private link is not written to console logs. Email requests have a ten-second timeout. Replacement links can be copied by the firm; this version does not automatically email replacements, send SMS, issue pre-recording invitations, or retry failed email deliveries in a background queue.

## Model and authorization

Migration `0010_private_intake_links` adds `intake_access`:

- One credential record per intake session.
- A composite session/firm foreign key.
- SHA-256 hash of a random 32-byte bearer token; no raw token storage.
- Expiration, revocation and issue timestamps.

New-session creation, frozen config, greeting and token hash are written in one database transaction. Every firm recording turn must provide the matching token in addition to conversation ID; firm slug alone or conversation ID alone is insufficient. Resume validates firm, token, expiration, revocation, session state and conversation binding before returning history. Private start/resume responses use `Cache-Control: no-store`. Tokens never appear in activity summaries. Link replacement/revocation adds an activity event.

The service lives in `backend/src/services/intake-access.ts`. Next.js start/turn routes enforce credentials; the legacy voice endpoint refuses firm-linked conversations. Token validation occurs on request admission. This is not a substitute for platform-wide rate limits, abuse prevention, verified client identity, or a complete public-endpoint security review.

## Run and verify

```bash
npm run db:migrate
npm run dev
```

Use a published firm intake, begin a recording, copy the private link, then pause/close the first window and resume in a different browser. Check that the same intake and saved transcript appear. Test revoke/replace from the firm's intake detail page, and confirm the old link fails. Automated tests cover hash-only storage, firm/session isolation, history/progress reads, expiry, replacement, revocation, closed sessions, missing turn credentials and legacy-endpoint bypass. HTTP tests disable speech/AI/email providers and do not send actual messages. Real recording/audio and email delivery require your configured providers.
