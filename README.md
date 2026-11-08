# LegalRoute

Attorney client management, intake, AI assistance, and native scheduling in one
npm workspace repository.

## Code ownership

```text
legal_route_ai/   Next.js application: screens, HTTP routes, Server Actions,
                 cookies, redirects, and page revalidation
backend/         Database schema/migrations, authentication persistence,
                 scheduling, firm services, integrations, and AI context reads
agents/          Maya, intake agents, provider adapters, and speech tools
frontend/        Original Vite scaffold (optional, not the Phase 1 application)
compose.yaml     Local PostgreSQL
```

Next.js imports backend and agent packages in-process. This is a code/package
separation, not a migration to separate HTTP services. The Express starter in
`backend/src/index.ts` remains an optional health-check server; the Phase 1 UI
does not call it. Some existing route/Server Action orchestration still uses the
backend's exported data layer. Compatibility modules under `legal_route_ai/src/lib`
and `src/db` point at the owning packages; they contain no duplicate models or
provider implementations.

## Local development

Requirements: Node.js 24 recommended (minimum 22.12), npm, Docker Desktop/Compose,
and Git. Run dependency installation from this repository root. There is one
committed root `package-lock.json`.

```sh
npm ci
cp .env.example .env                         # only if .env does not exist
cp legal_route_ai/.env.example legal_route_ai/.env.local  # only if missing
npm run db:up
```

Set `DATABASE_URL` in `legal_route_ai/.env.local` to match Compose. With the
unmodified local Compose defaults:

```ini
DATABASE_URL=postgresql://legalroute:legalroute_local@127.0.0.1:5432/legalroute
```

Then:

```sh
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Existing `.env.local` configuration, recordings, and
uploads remain in `legal_route_ai/`. Never overwrite a configured environment
file or commit real secrets/client data. Backend migration tools also support
`backend/.env.local` or `backend/.env`; explicit process environment takes priority.

The web app's `predev` and `prebuild` compile backend/agent packages automatically.
Next.js development resolves package source exports for live changes; production
uses the compiled package entrypoints. Start commands from the appropriate npm
workspace to keep existing local upload/recording paths stable.

## Checks and commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Phase 1 Next.js app |
| `npm start` | Run the built Next.js app |
| `npm run start:api` | Run the optional Express health server |
| `npm test` | Backend and agent regression tests; no provider keys needed |
| `npm run test:postgres -w backend` | Isolated live PostgreSQL integration tests |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run build` | Build packages, legacy frontend, and Next.js app |
| `npm run build -w legal_route_ai` | Build web app using Webpack |
| `npm run lint` | Lint backend, agents, and Next.js code |
| `npm run db:migrate` | Apply backend-owned migrations |
| `npm run db:generate -w backend` | Generate migrations from the backend schema |
| `npm run db:down` | Stop local PostgreSQL, preserving its volume |
| `npm run agents:run` | Run the starter agent once |
| `npm run dev:scaffold` | Run the original Vite/Express scaffold |

To include a production HTTP smoke test after `npm run build`, run
`TEST_WEB=1 npm run test:postgres -w backend` (macOS/Linux). This starts a temporary
web server, checks login protection and calendar data delivery, and stops it.

Live PostgreSQL tests create/drop a uniquely named test database and require a
local role with `CREATEDB`. They never migrate or seed the configured application
database. The default Compose development role supports these tests.

See [backend](backend/README.md), [agents](agents/README.md),
[web app setup](legal_route_ai/README.md), and the
[scheduling model](docs/scheduling.md).
