# LegalRoute

This repository holds two separate projects. Each one installs and runs on its own.

| Folder | What it is | Stack | Runs at | Setup guide |
|---|---|---|---|---|
| [`legal_route_ai/`](legal_route_ai/) | **Phase 1 app.** Attorney screens, Maya assistant, client voice intake | Next.js 16, Drizzle, PostgreSQL | http://localhost:3000 | [legal_route_ai/README.md](legal_route_ai/README.md) |
| `frontend/`, `backend/`, `agents/` | **Scaffold.** Starting point for a separate frontend, API and agents (no features yet) | Vite + React, Express, PostgreSQL in Docker | http://localhost:5173 (API on 3001) | [Scaffold setup](#scaffold-frontend-backend-agents) below |

**Want to run the Phase 1 app?** Follow [legal_route_ai/README.md](legal_route_ai/README.md) only. You don't
need the scaffold steps below, and you don't run `npm install` at the repo root.

## Get the code

The repository is private. Ask the owner to add your GitHub account as a collaborator, then:

```sh
git clone https://github.com/legalroute/LEGALROUTE-APP.git
cd LEGALROUTE-APP
git checkout feature-phase-1   # the Phase 1 app is on this branch until it is merged into main
```

If `git clone` says "Repository not found", sign in first with `gh auth login` (GitHub CLI) or a personal
access token.

## Requirements (both projects)

- **Node.js 22.12 or newer** (Node 24 recommended; `.nvmrc` is included), with npm
- **Git**
- **PostgreSQL:** the scaffold uses Docker (`compose.yaml`). The Phase 1 app works with either a local
  PostgreSQL install or that same Docker database; see its README.

Step-by-step installs for Windows, macOS and Linux are in
[legal_route_ai/README.md → Prerequisites](legal_route_ai/README.md#prerequisites).

**Both projects use PostgreSQL on port 5432.** Run either the Docker database or a locally installed
PostgreSQL, not both at once. The Phase 1 app can use the Docker one (database `legal_ai`), so a single
PostgreSQL can serve both projects.

## Scaffold (frontend, backend, agents)

```text
frontend/      React application powered by Vite
backend/       Express API and PostgreSQL connection pool
agents/        TypeScript automation runtime and starter agent
compose.yaml   Local PostgreSQL with a persistent named volume
```

These three folders are an npm workspace managed from the repo root. `legal_route_ai/` is **not** part of
that workspace. The scaffold additionally needs Docker Desktop or Docker Engine with Compose v2.

### Local setup

Run from the repository root:

```sh
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm install
npm run db:up
npm run dev
```

Open http://localhost:5173. The API listens on http://127.0.0.1:3001.
The page reports API/database connectivity. Check it directly:

```sh
curl --fail http://127.0.0.1:3001/api/health
```

A successful response is `{"status":"ok","database":"connected"}`. If PostgreSQL
is unavailable, the endpoint returns HTTP 503. No tables or sample records are
created. Add schema migrations before implementing persistent features.

Vite proxies `/api` to the local backend, so local development needs no CORS setup.
`VITE_API_BASE_URL` is public browser configuration and defaults to `/api`.
If changing the backend port, also update `frontend/vite.config.ts`.
Root `.env` configures Compose; `backend/.env` configures the API. Keep database
credentials and port in sync (URL-encode special characters in `DATABASE_URL`).
The database binds to loopback only. The example credentials are for local use.
If port 5432 is occupied, change `POSTGRES_PORT` and the port in `DATABASE_URL`.
Changing database credentials after initialization does not update the existing
volume; manage existing roles with SQL or deliberately recreate the local volume.

### Commands

Run these from the repository root. They apply to the scaffold only.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and backend together |
| `npm run typecheck` | Check all TypeScript workspaces |
| `npm run build` | Build all workspaces |
| `npm run agents:run` | Run the local starter agent once |
| `npm start` | Run the built API |
| `npm run db:up` | Start PostgreSQL and wait for health |
| `npm run db:down` | Stop PostgreSQL, retaining data |
| `npm run db:logs` | Follow database logs |
| `npm run preview -w frontend` | Preview the built frontend locally |

Build output is in `frontend/dist`, `backend/dist`, and `agents/dist`. For deployment, serve the
frontend through a static host and route `/api` to the backend. The Vite dev proxy
is not included in production builds or preview. Authentication, application
features, migrations, production hosting, and application automations are future work.
See [agents/README.md](agents/README.md) for the agent runtime and structure.

## Contributing

- Commit `package-lock.json` changes; installs can then use `npm ci`.
- Environment files (`.env`, `.env.local`), dependencies and build output are gitignored. Keep real
  credentials and client data out of Git.
