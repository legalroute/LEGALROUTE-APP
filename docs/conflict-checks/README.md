# Firm conflict checks and intake approval

This mechanism flags possible identity matches for attorney review. A name match does not determine a legal conflict, and no matches does not establish that representation is permitted. The checker searches the configured records, not external legal databases or every relationship relevant to a firm's review.

## Local setup

From the repository root:

```bash
npm run db:migrate
npm run dev
```

Migration `0008_conflict_checks` creates source mappings, immutable check snapshots and append-only review records, plus a composite firm key on intake sessions. Existing clients and intakes are preserved. New intake-to-client conversions require this workflow; existing client workspaces remain available.

## Prepare a party registry

Create a Google Sheet with one party per row, for example:

| Name | Role | Aliases | Matter | Attorney | Status | Email |
|---|---|---|---|---|---|---|
| Example Holdings | client | Example Trading\|Example Group | Matter-001 | Attorney A | former | |
| Example Opponent | defendant | | Matter-002 | Attorney B | active | |

The registry can include clients, defendants, opposing parties, organizations and other relevant parties. Do not exclude former clients or closed matters solely because of their status. Use separate rows for separate parties and separate aliases with `|`. Role values are displayed as supplied; all roles are compared. Only name and role mappings are mandatory. There are limits of 200 characters per name/alias, 20 aliases per record, 10,000 clients, and 20,000 total candidate records. Oversized, malformed or unavailable sources prevent clearance.

1. In **Connections**, connect Google Sheets and save the party tab as a firm table.
2. In **Conflict Checks → Party registry sources**, select that table.
3. Map its name and role columns, then map aliases, matter, attorney, status and email if available.
4. Save the mapping. Multiple firm tables can be mapped independently. Mappings record the source heading hash; changed headings require explicit remapping before clearance.
5. Refresh the table on Connections before checks. The checker uses the saved cache; it does not query Google during each check. Cached snapshots older than 24 hours are incomplete and must be refreshed.

This version uses connected Google Sheets tables and existing LegalRoute clients. Excel/CSV intake uploads do not automatically become conflict registries; a separate persisted-table upload connector can be added later.

## Run and review

For a standalone check, open **Conflict Checks**, enter the prospective client and any known opposing parties (one name per line), and confirm completeness. Manual checks can have review history, but cannot authorize an intake conversion: use an intake-linked check for that workflow.

For intake approval:

1. Open a submitted intake and click **Run conflict check**.
2. Confirm the prospective client's name and enter known opposing parties. Opposing parties are not guessed from conversational answers; a firm user confirms them explicitly. If the intake has no identifiable client name, correct that intake data before clearance.
3. Run the check. Each match shows the entered party, matched name, role/status, matter/attorney, source and matching reason.
4. An account with the **attorney** role records **Hold** or **Clear**, with a rationale of 10–4,000 characters. Staff can run checks and view results; admins can configure sources; neither staff nor admin accounts can clear checks or approve intakes unless their account has the attorney role.
5. Return to the linked intake and use **Accept & convert to client**. The backend revalidates the latest check, source fingerprint, freshness, intake details and latest attorney decision before atomically creating and linking the client.

Missing opposing parties, unconfirmed completeness, no mapped registry, malformed/oversized rows, disconnected sources, old caches, and truncated match results produce **incomplete** checks. Incomplete checks can be put on hold but cannot be cleared. Even a complete check with no matches needs an explicit attorney review.

A new incomplete check or hold supersedes earlier clearance for the same intake. Checks over 24 hours old, changed source data/mappings, refreshed source snapshots, and changed intake details require a new check and decision. Concurrent acceptance of the same intake creates one client. Source changes or new client entries also invalidate prior fingerprints; recheck other pending matters after accepting a client.

## Matching and boundaries

Comparison includes all parties entered for the new matter against all mapped source parties and existing firm clients. It checks normalized Unicode names, supplied aliases, equal name tokens in a different order, one-character spelling differences for names of at least five characters, and matching emails. It is deterministic and does not send registry data to AI. It does not infer corporate affiliations, beneficial ownership, family relationships, phonetic equivalents, transposed letters or broader legal conflict rules. Additional identifiers and attorney investigation remain necessary to distinguish namesakes and identify non-name-based issues.

The workflow gate applies to **intake acceptance**. Manual client entry and existing client status changes are separate workflows and are not gated by this first integration. Known opposing-party details must be entered by a firm user. Cases genuinely having no identified opposing party remain incomplete in this version; there is no blanket bypass.

Check snapshots retain entered parties, match evidence, source labels, issues and fingerprints, with actor/time/firm. Reviews are append-only with reviewer, decision, rationale and time. A later disconnect purges connector snapshots under the connector policy but does not remove existing conflict review evidence; this evidence persists for audit. The application currently has no automated retention/deletion policy for conflict records.

## Architecture

- `backend/src/services/conflicts/matching.ts`: normalization, bounded input and matching.
- `backend/src/services/conflicts/service.ts`: firm-scoped mapping, dataset/client reads, check snapshots, attorney reviews, stale-check validation and transactional intake approval.
- `legal_route_ai/src/app/(attorney)/conflicts`: authenticated UI and thin Server Actions.
- `intakes/actions.ts`: delegates acceptance to the shared conflict service. Future workflows can call the same service rather than implementing separate matching rules.

Composite foreign keys tie intake references, sources, reviewers and checks to their firms. Every service read is firm-scoped. Check/review rows are not edited by the service; a changed input creates another check or review. The service uses a firm advisory lock to serialize its own mapping/review/approval operations and a row lock to prevent duplicate intake conversion. Other source and client workflows remain independent; each decision is an evaluation of the cached source view available at validation time, not continuous monitoring of remote Sheets edits.
