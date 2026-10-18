# LegalRoute AI

Chat-first intake and client management for law firms. Clients answer a firm's intake form by talking with
Maya, an AI voice assistant; attorneys review intakes, manage clients and build forms by chatting with Maya.

Built with Next.js 16 (App Router, TypeScript), PostgreSQL via Drizzle ORM, Tailwind CSS v4, OpenAI or
Anthropic for the AI, and Deepgram for speech.

This is the **Phase 1 app** of the LEGALROUTE-APP repository. Everything in this guide runs from this
`legal_route_ai/` folder. The `frontend/`, `backend/` and `agents/` folders at the repo root are a separate
scaffold with its own setup ([root README](../README.md)); you don't need them to run this app.

> **Heads-up:** this is Next.js 16, which differs from older versions (for example, `src/proxy.ts` replaces
> middleware, and `params` / `cookies()` are async). Check `node_modules/next/dist/docs/` before changing
> framework-level code.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22.12 or newer (24 recommended; `.nvmrc` at the repo root) | Includes `npm` |
| [PostgreSQL](https://www.postgresql.org/download/) | 14 or newer (developed on 18) | Running locally on port 5432 |
| [Git](https://git-scm.com/downloads) | any | |
| Chrome or Edge | recent | For voice intakes (microphone access) |

Already have them? Check with `node -v`, `npm -v`, `git --version` and `psql --version`, then skip to
[Run it locally](#run-it-locally). Otherwise, install them for your operating system below.

### Install on Windows

The simplest route is `winget`, which is built into Windows 10 and 11. Open **PowerShell** and run:

```powershell
winget install --id OpenJS.NodeJS.LTS      # Node.js + npm
winget install --id Git.Git
winget install --id PostgreSQL.PostgreSQL.18 --interactive
```

- `--interactive` opens the PostgreSQL installer so you can **choose a password for the `postgres` user**.
  Write it down, because you need it for `DATABASE_URL`. Keep the default port **5432**. You can untick
  Stack Builder at the end.
- Prefer clicking through installers? Download them instead: Node.js LTS from https://nodejs.org, Git from
  https://git-scm.com/download/win, PostgreSQL from
  https://www.enterprisedb.com/downloads/postgres-postgresql-downloads.
- **Close and reopen PowerShell** afterwards so it picks up the new programs.
- The PostgreSQL tools (`psql`, `createdb`) are not added to PATH. Either use the full path, as the commands
  below do (`C:\Program Files\PostgreSQL\18\bin\...`), or add that folder to PATH.
- PostgreSQL runs as a Windows service and starts automatically with Windows.

### Install on macOS

Install [Homebrew](https://brew.sh) if you don't have it:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then:

```bash
brew install node git postgresql@18
brew services start postgresql@18          # starts now and at every login
echo 'export PATH="$(brew --prefix postgresql@18)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Homebrew's PostgreSQL has **no `postgres` user and no password**. Your Mac username is the database user.
So in step 2 run plain `createdb legal_ai`, and in step 3 use:

```ini
DATABASE_URL=postgres://YOUR_MAC_USERNAME@localhost:5432/legal_ai
```

(Run `whoami` to see your username. [Postgres.app](https://postgresapp.com) also works, with the same
connection string.)

### Install on Ubuntu / Debian Linux

```bash
sudo apt update
sudo apt install -y git postgresql
# Node.js 24 from NodeSource (the version in apt is usually too old)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
# Give the postgres user a password to use in DATABASE_URL
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'choose-a-password';"
```

PostgreSQL starts automatically as a service. If it isn't running, use `sudo systemctl start postgresql`.

### Check everything is installed

In a **new** terminal window:

```bash
node -v        # v22.12 or higher
npm -v
git --version
psql --version # Windows: & "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
```

### API keys (ask the team lead, or create your own):

| Key | Needed for | Get it from |
|---|---|---|
| `OPENAI_API_KEY` **or** `ANTHROPIC_API_KEY` | Maya (chat, intake builder, voice answers) | platform.openai.com / console.anthropic.com |
| `DEEPGRAM_API_KEY` | Speech-to-text and text-to-speech in voice intakes | console.deepgram.com |

Everything else (email, calendars) is optional; the app works without it.

## Run it locally

### 1. Clone and install

```bash
git clone https://github.com/legalroute/LEGALROUTE-APP.git
cd LEGALROUTE-APP
git checkout feature-phase-1
cd legal_route_ai           # this app lives in its own folder; run every command below from here
npm install
```

The repo is private: ask the owner to add your GitHub account as a collaborator, and sign in with
`gh auth login` (or a GitHub personal access token) if `git clone` says "Repository not found".

This folder is a standalone Next.js app. It is separate from the `frontend/`, `backend/` and `agents/`
scaffold at the repo root, and is not part of that npm workspace. Run `npm install` here, not at the root.

### 2. Create the database

Use the password you set for the `postgres` user when installing PostgreSQL.

Windows (PowerShell):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -h localhost -U postgres legal_ai
```

macOS (Homebrew):

```bash
createdb legal_ai
```

Linux:

```bash
createdb -h localhost -U postgres legal_ai      # asks for the password you set
```

(Adjust the path or version number if your PostgreSQL install differs, or create the database in pgAdmin.)

**Prefer Docker?** Skip installing PostgreSQL and use the database from the repo root's `compose.yaml`.
From the repo root:

```bash
cp .env.example .env
npm run db:up
docker compose exec postgres createdb -U legalroute legal_ai
```

Then in step 3 use `DATABASE_URL=postgres://legalroute:legalroute_local@localhost:5432/legal_ai`. Don't
run Docker's PostgreSQL and a locally installed one at the same time, because both use port 5432.

### 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local          # PowerShell: Copy-Item .env.example .env.local
```

Then edit `.env.local`:

```ini
DATABASE_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/legal_ai
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=            # optional if you use OpenAI
DEEPGRAM_API_KEY=...
```

`.env.local` is gitignored. Never commit keys.

### 4. Create the tables

```bash
npm run db:migrate
```

This applies every migration in `drizzle/` and creates an empty firm called **My Law Firm** (intake link
`/intake/my-firm`).

### 5. Start the app

```bash
npm run dev
```

Open http://localhost:3000.

### 6. Sign in

1. Enter any email address on the sign-in page.
2. Without email configured, the sign-in link appears **on screen** (development only), and it is also printed
   in the terminal. Click it.
3. The **first** person to sign in joins My Law Firm. Each later new email gets its own empty firm, because
   there are no team invites yet. To share a firm locally, everyone uses the same email, or you move a user
   in the database:
   ```sql
   UPDATE users SET law_firm_id = (SELECT id FROM law_firms WHERE slug = 'my-firm') WHERE email = 'you@example.com';
   ```

### 7. Check the AI provider (optional)

If you set only one AI key, Maya uses that provider automatically. If you set both, it defaults to
Anthropic; set `LLM_PROVIDER=openai` in `.env.local` to change that. To change the provider, model or voice,
open http://localhost:3000/settings. Choices made there are saved in your database and override
`.env.local`.

## Try the main flows

| What | Where |
|---|---|
| Home dashboard and Ask Maya | `/home` |
| Build an intake form by chatting with Maya, then **Publish** | `/intake-builder` |
| Do an intake as a client (voice: click the mic to start, click again to pause) | `/intake/my-firm`, or copy the link from **Settings → Intake link** |
| Review the submitted intake: accept, request info or decline | `/intakes` |
| Accepted intakes become clients: chat, documents, tasks | `/clients` |
| Firm profile, intake link, theme (Original / Black & white / Dark), notifications | `/firm-settings` |

A starter Personal Injury template (21 questions) is created automatically on first sign-in, so the intake
link works before you build anything.

**Testing voice from a phone or another computer:** browsers only allow the microphone on `https://` or
`localhost`. Expose your dev server with a tunnel such as [ngrok](https://ngrok.com/) (`ngrok http 3000`) and
open the `https://…ngrok-free.app` URL. ngrok hosts are already allowed in `next.config.ts`.

## Screens (Phase 1)

| Path | Screen |
|---|---|
| `/login` | Magic-link sign-in |
| `/home` | Greeting, search, quick actions, recent activity, Ask Maya |
| `/clients`, `/clients/[id]` | Client list and workspace (Chat, Overview, Documents, Activity, Tasks, Payments) |
| `/intakes`, `/intakes/[id]` | Intake review: submissions, answers, transcript, accept / request info / decline |
| `/intake-builder`, `/intake-builder/[id]` | Build intake forms by chatting with Maya; live preview; publish |
| `/calendar` | Connect Google Calendar or Calendly; schedule consultations (Apple is a placeholder) |
| `/firm-settings` | Firm profile, intake link, client experience, appearance, notifications, billing placeholder |
| `/intake/[slug]` | Public client intake link: voice conversation with Maya using the firm's published form |
| `/voice`, `/settings` | Original voice intake and its voice/AI settings (keep unchanged) |

Placeholders with no integration yet: Apple Calendar, billing/Stripe and e-signature.

## Optional services

All are configured in `.env.local`. Restart `npm run dev` after changing it.

| Service | Variables | Without it |
|---|---|---|
| Email via [Resend](https://resend.com/) (sign-in links, intake notifications) | `RESEND_API_KEY`, `EMAIL_FROM` | Emails are printed in the terminal; the sign-in link shows on screen in development |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Calendar page shows "Not configured on this server" |
| Calendly | `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` | Same |
| Public base URL | `APP_URL` | Links use the address in your browser |

Calendar redirect URIs to register with each provider: `<APP_URL>/api/calendar/google/callback` and
`<APP_URL>/api/calendar/calendly/callback`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks (typecheck generates route types first) |
| `npm run db:generate` | Create a SQL migration from changes to `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database |
| `npm run db:studio` | Browse data in Drizzle Studio |
| `npm run eval:intake` | AI accuracy eval: 16 scripted client conversations, checks extracted answers (uses your AI key) |
| `npm run eval:voice` | Voice robustness eval: synthesized speech with noise, accents and background talkers (uses AI + Deepgram) |

Eval reports are written to `evals/results/` (gitignored). `evals/voice-test-plan.md` is the checklist for
testing with real people.

## Changing the database

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate` and review the new file in `drizzle/`.
3. Run `npm run db:migrate`.
4. Commit the schema change and the migration together. Teammates run `npm run db:migrate` after pulling.

## Project layout

- `src/db/schema.ts`: table definitions (source of truth for migrations)
- `src/proxy.ts`: redirects signed-out visitors away from attorney pages (pages still verify the session)
- `src/app/(attorney)/`: signed-in attorney screens sharing the sidebar layout
- `src/app/intake/[slug]` and `src/app/api/intake/`: public firm intake link
- `src/app/voice`, `src/app/api/voice`: original voice intake (the mic component is shared with the intake link)
- `src/lib/auth.ts`: magic links and sessions
- `src/lib/maya/`: Maya's prompts and chat memory per screen
- `src/lib/llm/`: switchable OpenAI / Anthropic layer
- `src/lib/theme.ts` and `src/app/globals.css`: the three themes
- `drizzle/`: generated SQL migrations (commit these)
- `evals/`: AI accuracy and voice robustness tests
- `uploads/`, `recordings/`: local file storage (gitignored)

## Troubleshooting

| Problem | Fix |
|---|---|
| `node`, `npm`, `git` or `psql` "is not recognized" / "command not found" | Open a new terminal after installing. For `psql` on Windows, use the full path (see above) |
| Windows: `npm.ps1 cannot be loaded because running scripts is disabled` | Run once in PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `npm.cmd` instead of `npm` |
| `connection refused` on port 5432 | PostgreSQL isn't running. Windows: start the "postgresql-x64-18" service in Services. macOS: `brew services start postgresql@18`. Linux: `sudo systemctl start postgresql` |
| `DATABASE_URL is not set` | Create `.env.local` (step 3) in the project root |
| `password authentication failed for user "postgres"` | Fix the password in `DATABASE_URL` |
| `database "legal_ai" does not exist` | Run step 2 |
| `relation "..." does not exist` | Run `npm run db:migrate` (also needed after pulling new migrations) |
| Port 3000 in use | `npm run dev -- -p 3002` (3001 is the scaffold API) |
| Maya replies with an error | Check the AI key in `.env.local` matches the provider chosen on `/settings` |
| Mic doesn't start | Use `localhost` or an `https://` tunnel, and allow microphone access in the browser |
| No voice / transcription | Check `DEEPGRAM_API_KEY` |
| I signed in but see no data | You got your own firm (only the first sign-in joins My Law Firm). See step 6 |
| Type errors about routes after adding or removing a page | `npx next typegen` |
