# Google Sheets datasets

Implemented MVP: a law firm connects a Google account, pastes a spreadsheet link,
chooses a tab, previews types, and saves a named, read-only table. PostgreSQL
caches the latest complete snapshot; Google Sheets remains authoritative.
This does not import clients, write to Google Sheets, or expose provider keys to agents.

## Setup

1. Enable the Google Sheets API in a Google Cloud project and create an OAuth 2.0
   **Web application** client. Configure the Google consent screen and test users
   if the app is in testing. Use a dedicated Sheets client rather than the
   existing calendar client. See [Google's server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).
2. Register this redirect URI exactly for local development:
   `http://localhost:3000/api/connectors/google-sheets/callback`.
3. Add these values to the ignored `legal_route_ai/.env.local`:

   ```ini
   APP_URL=http://localhost:3000
   GOOGLE_SHEETS_CLIENT_ID=your-client-id
   GOOGLE_SHEETS_CLIENT_SECRET=your-client-secret
   CONNECTOR_ENCRYPTION_KEY=64-hex-characters
   ```

   Generate the encryption key once with:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Keep the key stable and private, separate from database backups. Replacing it
   without migrating encrypted credentials requires reconnecting accounts. Use a
   secret manager for deployed environment configuration. Production `APP_URL`
   must use HTTPS, and its callback must be registered with Google.
4. From the repository root, run `npm run db:migrate`, then restart `npm run dev`.
5. Open `/connections`, connect Google, paste a spreadsheet URL/ID, load its tabs,
   preview one, confirm types, and save the table.

This implementation requests `openid`, `email`, and `spreadsheets.readonly`.
That Sheets scope can read the user's spreadsheets; selecting a tab in LegalRoute
is an application restriction, not a narrow OAuth permission. No Drive-listing
permission is requested: users paste a link instead of browsing their Drive.
See [scope details](https://developers.google.com/workspace/sheets/api/scopes).

## Implemented model

| Table | Purpose |
| --- | --- |
| `connector_connections` | Firm/account/owner, granted scopes, status, generation, encrypted Google tokens |
| `connector_oauth_states` | Hashed one-time state, encrypted PKCE verifier, user binding, callback and expiration |
| `datasets` | Firm/connection, source spreadsheet/tab IDs, display name and optimistic edit version |
| `dataset_snapshots` | Complete version with typed column definitions in JSONB, schema hash and row count |
| `dataset_rows` | Per-snapshot row positions, raw text, normalized JSONB values and conversion diagnostics |
| `connector_runs` | Refresh status, counts, safe error messages and timestamps |

The migration is `backend/drizzle/0007_sheet_datasets.sql`. Composite firm foreign
keys protect dataset ownership throughout. A partial unique index enforces one
active snapshot per dataset. Column definitions are embedded in the snapshot,
not stored in a separate `dataset_columns` table; this keeps schema and rows
versioned together without creating SQL tables per spreadsheet.

## Permissions and credentials

Attorneys and administrators can connect accounts. The connection owner or a
firm administrator can preview, save, refresh or disconnect that source.
Authenticated members of the same firm can view its saved tables; staff cannot
manage sources. Authentication and form/route CSRF protection remain in Next.js;
backend services enforce firm and role checks independently.

OAuth uses a browser state cookie plus a hashed, expiring, single-use server-side
state tied to the signed-in user and PKCE. Tokens are AES-256-GCM encrypted with
firm/owner/account-bound authenticated data; an expiring access token is refreshed
server-side. This encryption is separate from the old calendar token columns.

Disconnect immediately clears stored credentials and cached snapshots/rows for
ALL datasets using that connection and blocks in-flight publication. Metadata
and run history remain. It does not revoke the grant at Google: the user can
remove the app in their Google account. The confirmation UI states this explicitly.

## Snapshot and refresh behavior

- The first source row supplies headers. Blank/duplicate headers have distinct
  positional column IDs (`c0`, `c1`, ...), so values do not overwrite one another.
- Inference is conservative: text, plain safe numbers, true/false booleans and
  ISO `YYYY-MM-DD` dates. Leading-zero identifiers stay text. Original displayed
  cell values are retained; invalid conversions are displayed with a warning.
- A preview content hash prevents saving data that changed since preview.
- Manual refresh retains confirmed types when headers match. Changed headers or
  column count require **Review source** and another explicit save. On schema
  changes, types are suggested again; overrides are not silently moved to other
  columns. Identical headers cannot prove column identity after source reordering.
- New rows are staged in a transaction; snapshot activation, old-cache removal
  and successful run status commit together. Failures keep the last good view.
- Reads use a repeatable-read transaction so pagination requests don't combine
  metadata from one snapshot with rows from another within the same request.
  Separate page requests may reflect a newer refresh; no cross-page snapshot pinning.
- Source row positions are only snapshot-local identities. Row reordering changes
  positions and row deletion changes the cached view; core client records are
  untouched. Stable annotations and client mapping are not supported yet.
- Connection locks and generation checks prevent publication after disconnect or
  reconnection. Dataset versions reject stale reviews or refreshes. One running
  refresh per dataset is enforced; abandoned runs can be failed after ten minutes.
- Retention is intentionally bounded to the current snapshot. There is no
  user-visible historical version recovery; run summaries are retained.

## Limits and deliberate boundaries

Each selected tab must have at most **10,001 grid rows including the header,
100 grid columns, 200,000 grid cells, and a 5 MB response**. These checks include
unused grid dimensions; resize an oversized tab or connect a smaller copy.
Preview shows five rows; tables paginate by 50 rows. Google reads have timeouts
and bounded retries for quota/server failures. Cells are rendered as text; no
spreadsheet formulas are executed by LegalRoute.

Refreshes run synchronously in the server request, with a persisted run record.
There is no durable background worker/checkpoint resume, scheduled sync, Google
Drive picker, custom display-label editor, local row editing, agent dataset tool,
export, two-way sync, or client-record mapping in this MVP. Long refreshes may
need a worker before serverless deployment. Google does not provide a transactional
snapshot guarantee for our separate metadata/value reads; source edits during a
read can require a retry/review. Data is not continuously live.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:postgres -w backend
TEST_WEB=1 npm run test:postgres -w backend
```

Tests use synthetic data and simulated Google responses. They cover encryption,
OAuth state consumption, ownership, source validation, type conversion, schema
changes, stale edits, atomic refresh failure, disconnect races and pagination-ready
reads. Real consent/refresh calls must additionally be verified with a configured
Google test account; no credentials are bundled with the app.

For a business-friendly walkthrough, see [Google Workspace business-account setup](../../../docs/google-sheets-business-setup/README.md). It separates one-time operator setup from law-firm account connection and IT approval.

## Generate intake drafts

Connected firm tables can now supply question definitions or column headings for a new intake draft. Uploading `.xlsx` or `.csv` is also available without Google configuration. See the [intake generation guide](../../../docs/intake-imports/README.md). Drafts are independent of their source and require explicit publication.
