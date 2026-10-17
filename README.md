# LegalRoute

React + TypeScript frontend, Express + TypeScript API, and PostgreSQL for local development.
Intended private GitHub repository: `legalroute/legalroute-app`.

## Project layout

```text
frontend/      React application powered by Vite
backend/       Express API and PostgreSQL connection pool
agents/        TypeScript automation runtime and starter agent
compose.yaml   Local PostgreSQL with a persistent named volume
```

This project is self-contained in `Desktop/legalroute-app`. It does not depend on
or modify `Desktop/legalRoute`, `voice-relay`, or `voiceagentmiddleware`.

## Requirements

- Node.js 22.12 or newer (Node 24 recommended; `.nvmrc` included), with npm
- Docker Desktop or Docker Engine with Compose v2
- Git; GitHub CLI is optional for repository creation

## Local setup

Run from this repository root:

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

## Commands

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

## Private GitHub repository

The local repository uses `main` and is prepared for
`git@github.com:legalroute/legalroute-app.git`. No repository has been published.
With GitHub CLI installed, authenticate to an account allowed to create repositories
in the `legalroute` organization, then run:

```sh
gh auth login
git add .
git commit -m "Scaffold LegalRoute frontend, backend, and local database"
gh repo create legalroute/legalroute-app --private --source=. --push
```

Commit the generated `package-lock.json` after the first `npm install`; subsequent
installs can use `npm ci`. Environment files, dependencies, and build output are
ignored. Keep real credentials and client data out of Git.
