# LegalRoute agents

TypeScript automation workspace. The starter agent runs once, reports readiness,
and exits. Add integrations as needed; no model provider is configured.

```text
agents/
├── src/
│   ├── index.ts           CLI entry point
│   ├── agents/starter/    Runnable starter and its documentation
│   ├── workflows/        Multi-step orchestration
│   ├── tools/            External integrations and actions
│   └── shared/types.ts   Agent interface and execution context
├── tests/fixtures/       Synthetic test data
├── .env.example
├── package.json
└── tsconfig.json
```

## Run

After `npm install` at the repository root:

```sh
npm run agents:run
npm run typecheck -w agents
npm run build -w agents
npm run start -w agents
```

The starter prints a readiness message and `{"agent":"starter","status":"ready"}`.
It requires no running API, database, or credentials. Root `npm run build` and
`npm run typecheck` include this workspace. Root `npm run dev` starts only the web
application and API; automations are invoked explicitly.

## Add an agent

Create `src/agents/<agent-name>/` with its implementation, prompts if needed, and
a README describing purpose, inputs, outputs, permissions, configuration, and run
instructions. Implement the shared `Agent<Input, Output>` interface and wire the
agent into the CLI or a workflow. Put reusable integrations in `src/tools/` and
orchestration in `src/workflows/`. Add meaningful tests with synthetic fixtures
when implementing real behavior.

Copy `.env.example` to `.env` when configuration is needed. The runtime loads
`agents/.env` in development and after compilation. Keep credentials and client
data out of Git. Access application data through deliberate backend APIs or
explicitly scoped database access. Document actions requiring human review.
