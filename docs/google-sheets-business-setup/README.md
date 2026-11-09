# Connect a business Google Workspace account to LegalRoute

Use this guide to enable the Google Sheets connector and connect a law firm's
business account, such as `attorney@examplefirm.com`.

**LegalRoute's operator configures Google once per deployment. Each law firm then
clicks Connect Google account and chooses its own spreadsheet.** Customers of a
hosted LegalRoute deployment do not create OAuth clients, edit environment files,
or generate encryption keys. A firm running its own LegalRoute instance performs
both parts of this guide.

## Who does what?

| Person | Responsibility |
| --- | --- |
| LegalRoute application/server administrator | Google Cloud project, OAuth application, callback URL, server secrets, deployment |
| Law firm's Google Workspace administrator | Approves the OAuth application if the firm's Google policies require approval |
| Attorney or LegalRoute firm administrator | Connects their Google account and adds a spreadsheet table |
| Other authenticated members of that LegalRoute firm | View the firm's saved read-only tables |

Google Cloud access and Google Workspace administrator access are separate
permissions; one person may have both, but neither automatically supplies the
other. This connector uses individual user consent, not a service account or
domain-wide delegation.

## Part A — One-time LegalRoute operator setup

### 1. Gather the deployment details

Have the following ready:

- Access to the intended Google Cloud project and permission to configure OAuth.
- An application support email and a person responsible for the deployment.
- Your LegalRoute address: `http://localhost:3000` for local testing, or the actual
  HTTPS address of the hosted application.
- Access to the server's environment configuration and running PostgreSQL.

Use a Google Cloud project controlled by your business. Use separate development
and production OAuth clients and encryption keys. Keep the Sheets client separate
from LegalRoute's existing calendar client.

### 2. Enable Google Sheets and configure branding

In [Google Cloud Console](https://console.cloud.google.com/), select the intended
project. In **APIs & Services → Library**, find **Google Sheets API** and enable it.
Then open **Google Auth platform → Branding**, initialize the app if needed, and
supply the application name, support email, and contact information. Use the
name **LegalRoute** or your approved deployment name.

Google's [Sheets setup reference](https://developers.google.com/workspace/sheets/api/quickstart/nodejs)
shows API enablement and the current Google Auth platform menus. Its sample uses
a desktop client; this LegalRoute integration instead requires the web client in
step 4 below. No sample application or additional Google SDK installation is needed.

### 3. Select the audience and requested data access

Under **Google Auth platform → Audience**, choose based on who will connect:

| Deployment | Audience choice |
| --- | --- |
| Hosted LegalRoute serving multiple unrelated law firms | **External** |
| A self-hosted instance restricted to one Google Workspace organization | **Internal**, if available for that organization's project |
| Local testing with accounts outside the project's organization | **External**, in testing, with those accounts added as test users |

A business email does not by itself make the application Internal. Internal limits
authorization to the project's organization. External testing is for an approved
test-user list; it is not the final customer rollout configuration. Before broad
customer use, review Google's publishing and verification requirements for the
chosen audience/scopes. Do not ask customers to bypass Google warnings.
See [Google's audience guidance](https://support.google.com/cloud/answer/15549945)
and [OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

In **Data Access**, configure the access requested by this implementation:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/spreadsheets.readonly
```

The runtime requests `openid email` plus the Sheets scope; `email` is the OpenID
Connect alias for email access. Sheets read-only permission is broader than a
single chosen tab. LegalRoute limits what it reads through source selection,
but that selection does not reduce Google's actual grant. No sheet-writing or
Drive file-listing permission is requested. See [Sheets scope details](https://developers.google.com/workspace/sheets/api/scopes).

### 4. Create the Web application OAuth client

In **Google Auth platform → Clients**, create an OAuth client with application
type **Web application**. Give it an environment-specific name, for example
`LegalRoute Sheets — Local`.

Add the exact **Authorized redirect URI**:

| Environment | URI |
| --- | --- |
| Local | `http://localhost:3000/api/connectors/google-sheets/callback` |
| Hosted example only | `https://YOUR-LEGALROUTE-DOMAIN/api/connectors/google-sheets/callback` |

Replace the hosted example with the real domain. Keep scheme, host, port, path,
and trailing-slash behavior consistent; `localhost` and `127.0.0.1` are different
hosts. Use the same hostname in your browser and `APP_URL` so the OAuth state
cookie returns to the correct host. This server-side flow does not require a
browser API key or a JavaScript-origin entry solely for the connector.

Save the client ID and client secret in your approved secret store. The client ID
identifies the app; the client secret belongs on the server, never in browser
code or a `VITE_`/`NEXT_PUBLIC_` variable.
See [Google's web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server).

### 5. Configure the LegalRoute server

For local development, open `legal_route_ai/.env.local`. Keep existing database
and other settings and add/update these entries once; avoid duplicate keys:

```ini
APP_URL=http://localhost:3000
GOOGLE_SHEETS_CLIENT_ID=PASTE_CLIENT_ID
GOOGLE_SHEETS_CLIENT_SECRET=PASTE_CLIENT_SECRET
CONNECTOR_ENCRYPTION_KEY=PASTE_64_HEX_CHARACTERS
```

From your terminal, generate the encryption key once:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy that output into `CONNECTOR_ENCRYPTION_KEY`. This is a LegalRoute encryption
key, not a value from Google. Preserve it across restarts and deployments; losing
or replacing it makes existing encrypted connector credentials unreadable. A key
rotation needs a credential migration or account reconnection.

On a hosted server, set the same names through the deployment's secret/environment
configuration, use the real HTTPS `APP_URL`, and keep the encryption key separate
from database backups. Do not commit secrets, put them in the README, or send them
to ordinary firm users. `.env.local` is ignored by this repository.

### 6. Run migrations and restart

For this development workspace:

```sh
cd ~/Desktop/legalroute-app
npm run db:up
npm run db:migrate
npm run dev
```

Stop an older app process with **Ctrl+C** before starting another on port 3000.
If setting up a fresh checkout, run `npm ci` at the repository root first and
configure `DATABASE_URL` using the [root README](../../README.md).
For hosted deployment, run migrations and build/start through the normal release
process; this local command block is not a production hosting recipe.

Open `http://localhost:3000/connections`. Sign in to LegalRoute using an attorney
or firm-admin account. **Connect Google account** appears when the required
server settings are present. If the page still says setup is required, inspect
the four settings above and restart the process reading that environment file.

## Part B — Google Workspace administrator approval, when required

The law firm's Google Workspace policy may block third-party OAuth applications
even when the LegalRoute server is configured correctly. The firm's Workspace
administrator should:

1. Obtain the correct environment's OAuth **client ID** from the LegalRoute
   operator. The client secret and LegalRoute encryption key are not needed.
2. In [Google Admin Console](https://admin.google.com/), go to **Security → Access
   and data control → API controls → Manage Third-Party App Access**.
3. Find/configure the application by OAuth client ID, verify its identity, and
   review requested scopes.
4. Apply the firm's approved access setting to the intended users/groups or
   organizational units. Use scope-specific access where available and
   appropriate; do not relax the organization's global app policy just to connect.
5. Ask the attorney to retry the connection.

This requires the relevant Workspace admin privileges. Approval does not grant
the user access to spreadsheets they could not otherwise read. It also does not
replace individual OAuth consent or LegalRoute permissions. See
[Google's administrator instructions](https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data).

## Part C — Connect the firm's account and add a table

These are the steps ordinary customers follow after the operator setup:

1. Sign in to the correct firm in LegalRoute. Open **Connections**.
2. Click **Connect Google account** and choose the firm's intended Google Workspace
   account. Check the account email carefully if multiple accounts are signed in.
3. Review Google's consent screen and grant the requested read access. Return to
   LegalRoute; the business account should appear as connected.
4. Under **Add a table**, select that Google account and paste the spreadsheet's
   URL. It must be readable by the Google account just connected; it does not
   need to be made public. Use a synthetic test sheet for initial verification.
5. Click **Load tabs**, choose a tab, then click **Preview tab**. The first row is
   treated as column headers.
6. Name the table and confirm each suggested column type. Leading-zero IDs should
   remain text; date conversion currently expects `YYYY-MM-DD`.
7. Click **Save table**. Verify the displayed values against the source sheet.
8. Change a synthetic source value in Google Sheets and click **Refresh** in
   LegalRoute. Confirm the updated value appears. This is manual refresh, not
   continuous live synchronization.

The connection owner or a firm admin manages the source; authenticated members
of that firm can view its saved tables. Sheet rows are not automatically converted
into LegalRoute clients or appointments. If column headers change, use **Review
source** to confirm the new schema before saving it.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No Connect button; “setup is required” | Missing client ID/secret, `APP_URL`, or a 64-character hexadecimal encryption key; incorrect environment file; process not restarted. |
| Connected account but no Add a table form | Signed-in user must own that connection or be the firm's admin, with attorney/admin management permissions; account must be connected. |
| `redirect_uri_mismatch` | Google registration must exactly match `APP_URL` plus `/api/connectors/google-sheets/callback`; check hostname, port, HTTPS and environment. |
| Google says access is blocked | Confirm audience/test-user eligibility with the operator and review Workspace app controls with the firm's administrator. |
| Authorization fails after returning | Use one browser/hostname throughout, begin again from Connections, and complete the flow before the ten-minute state expires. |
| Sheet not found or access denied | Verify the chosen business account can open that exact spreadsheet and granted Sheets read access; check the Sheets API is enabled in the client's project. |
| Access later stops refreshing | Reconnect the account; review revocation, publishing/test mode and Workspace policy. External-testing refresh tokens can be short-lived; see Google's OAuth documentation. |
| Existing credentials fail after a deployment | Verify the original encryption key was preserved. Do not generate a new key on every deployment. |
| Tab exceeds the supported size | Resize/select a smaller tab: up to 10,001 grid rows including headers, 100 columns, 200,000 grid cells, and a 5 MB response. Unused grid dimensions count. |
| Columns changed | Use Review source; confirm types and save. Failed refreshes leave the last good snapshot visible. |

For support, provide the app/environment name, client ID, account domain, timestamp,
and the visible error text. Never share the client secret, encryption key, access
or refresh tokens, or client records in screenshots/logs.

## Disconnect and handover

Disconnecting in LegalRoute removes stored connector credentials and cached data
for all tables using that account; Google Sheets itself is unchanged. Dataset
metadata and refresh summaries remain. The current Disconnect action does not
revoke the grant at Google; account owners can remove it in their Google account's
third-party connections settings.

For staff changes, identify the source owner and confirm that the replacement
Google user has access to the business spreadsheet before reconnecting. The MVP
does not automatically transfer connection ownership.

Record the Cloud project/client ID, environment URL, callback URI, support owner,
Workspace approval contact, and **secret-store locations** in your internal
handover. Store actual secrets separately.

Implementation details: [connector README](../../backend/src/connectors/README.md).
Data relationships: [data model README](../../backend/src/db/README.md).
