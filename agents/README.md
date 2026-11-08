# LegalRoute agents

Owns AI behavior and provider/speech adapters. Agents receive application context
as inputs; they do not query PostgreSQL or import Next.js.

```text
src/
  agents/
    maya/             Attorney home, client, and intake-builder assistants
    intake/           Legacy and template-driven voice intake behavior
    starter/          Local runtime smoke check
  llm/                OpenAI/Anthropic adapters and structured generation
  tools/deepgram.ts   Speech transcription/synthesis
  shared/             Assistant identity and starter execution interfaces
  workflows/          Reserved for future orchestration
  index.ts            Starter CLI
tests/                Offline intake and provider-routing regression tests
```

From the root, run `npm run agents:run`, `npm run test -w agents`, or
`npm run build -w agents` (build backend first if running package builds manually).
Next.js still loads the existing `legal_route_ai/.env.local` AI/speech keys;
standalone automations can use `agents/.env`. No real provider calls are made by
the regression tests. Live AI evaluation commands remain in the web workspace
and continue to use compatibility imports.

Backend context builders read firm/client records. Thin Next.js Maya adapters
combine that context with the agent call; existing actions persist the result.
Dependencies flow from agents to backend contracts/helpers, never from backend
to agents. External side effects should remain explicit backend operations.
