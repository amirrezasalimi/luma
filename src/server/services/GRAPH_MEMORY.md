# Factual graph memory

Jarvis wraps pinned `@oh-my-pi/pi-mnemopi@18.20.2` through the native
`graph_memory` tool. Requires Bun >= 1.4.4. The integration is independent of
OMP's agent/session wrapper.

## Boundaries and privacy

- SOUL.md remains authoritative for identity/personality/personal preferences.
  Its contents are neither migrated nor modified by this integration.
- Graph tools accept supported factual relationships, with a source reference,
  evidence quote, confidence, and backend-generated recording timestamp.
  Provenance/confidence are agent-supplied claims, not independently verified.
- Each workspace/profile pair has its own hashed database filename. Facts are
  shared across sessions, but not across agent profiles. Session IDs are stored
  as provenance, not recall boundaries. The workspace boundary is the configured
  memory directory (by default beside the application database).
- Legacy session databases are imported once into the corresponding profile's
  workspace graph. Active exact duplicates are deduplicated; conflicting values
  are preserved for inspection. Original databases remain untouched. Legacy
  retired facts stay in the original archive and are not restored to recall.
- Files live beside the app database in `graph-memory/`; override with
  `JARVIS_MEMORY_DIR`. New directory/file permissions are 0700/0600. Back up this
  directory separately alongside the app database.
- Embeddings, the additional memory LLM, proactive linking and automatic
  extraction are explicitly disabled. No models are downloaded by this adapter.
- No automatic ingestion of conversations or Soul, and no automatic context
  injection. The agent decides when supported facts warrant an explicit save.

## Tool actions

| Action | Fields | Result |
| --- | --- | --- |
| `remember` | subject, predicate, object, source, evidence; optional confidence | Saves an explicit triple and Mnemopi searchable fact atomically |
| `search` | query; optional limit | Mnemopi lexical recall, default 3/max 4 facts |
| `relations` | entity; optional after, limit | Exact incoming/outgoing edges, cursor pagination via nextAfter |
| `forget` | id | Retires one triple and removes its memory from recall |
| `status` | — | Counts and configuration, no full graph dump |

For example: `{"action":"remember","subject":"Jarvis","predicate":"uses_database","object":"SQLite","source":"src/server/database.ts","evidence":"import { Database } from 'bun:sqlite';"}`.

Subject/object matching is exact after Unicode normalization and whitespace
trimming; predicates are also lowercased. Reuse consistent entity names.
There is no automatic entity merging or semantic similarity search.

Identical active triples are deduplicated. Different objects for the same
subject/predicate are conservatively refused: Mnemopi's TripleStore.add retires
earlier values, so the wrapper requires explicit retirement instead of silent
replacement. Multi-valued predicates are not currently supported; use qualified
predicates where appropriate. Retirement retains the historical triple/evidence
for provenance; it is **not secure erasure**. No bulk-clear tool is exposed.

Results are bounded by field sizes and a four-fact maximum (roughly 7 KB of text
before JSON escaping), and marked untrusted. No per-turn graph dump, persistent
open-handle cache, background extraction, or consolidation jobs. Database
creation occurs only when memory is accessed; handles close after each
operation. Tool calls use Jarvis's existing tool-history auditing.

This adapter uses Mnemopi's TripleStore, remember/recall/forget APIs plus a small
mapping table in each scoped database. SQL reads provide bounded pagination and
provenance without materializing the whole graph. Review these integration
points before upgrading the pinned dependency.
