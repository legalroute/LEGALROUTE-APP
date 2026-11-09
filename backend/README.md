# LegalRoute backend

Owns the PostgreSQL model and shared backend behavior. It has no Next.js or agent
runtime dependency. The web app invokes these services in-process; Express is
currently only the original optional health-check starter.

```text
src/
  db/                 Drizzle schema and pooled PostgreSQL connection
  contracts/          Provider configuration types and defaults
  services/
    auth.ts           Magic-link tokens, accounts, and session persistence
    scheduling/       Appointment validation and transactional writes
    maya/             Firm/client context queries and chat persistence
    firm.ts           Firm provisioning and activity
    calendar.ts       Existing external calendar adapter
    email.ts          Email delivery
    uploads.ts        Local document path handling
    settings.ts       Stored app settings
    public-intake.ts  Public template resolution
    intake-config.ts  Intake configuration validation and starter template
    voice-types.ts    Browser/server voice DTOs
  index.ts            Optional Express health server
  config.ts           Express starter configuration
  env.ts              Shared, path-stable environment loading
drizzle/              Single migration history (moved without rewriting history)
tests/                Model, scheduling, architecture, and PostgreSQL checks
```

Use `npm run db:migrate` from the repository root. Existing web migration commands
still work through a compatibility config. Configuration can remain in
`legal_route_ai/.env.local`; no secrets were moved into source control.

`npm run test -w backend` runs in-memory PostgreSQL regression tests.
`npm run test:postgres -w backend` exercises real PostgreSQL migrations, login
and session behavior, and simultaneous scheduling in a temporary database.

Cookies, request origin, authentication redirects, HTTP/form parsing and cache
revalidation remain in Next.js adapters. Services receive authenticated user
context rather than reading browser cookies themselves. AI context queries live
here, while agents consume that context as data.

The optional Express health endpoint uses the same Drizzle/PostgreSQL pool.
There is no second legacy database connection module.

See the [data model README](src/db/README.md) for entity relationships, flexibility,
current constraints, and the implemented firm-owned Google Sheets dataset model.
See the [connector setup guide](src/connectors/README.md) to enable OAuth and encryption.
