✅ CONCRETE IMPLEMENTATION PLAN

(Recommended + Possible only)

PHASE 1 — MCP COMPLIANCE & VISIBILITY (FOUNDATIONAL)

These are must-have per MCP expectations and safe to add.

1️⃣ Tool Manifest / Capability Discovery ✅

Why (from MCP docs)

MCP clients must know what tools are available

Enables dynamic agent compatibility

What to implement

A static manifest returned by the server

Concrete output

{
  "tools": [
    "index_workspace",
    "semantic_search",
    "get_file",
    "get_context_for_prompt",
    "enhance_prompt",
    "index_status",
    "reindex_workspace",
    "clear_index"
  ]
}


Implementation

Add tools.list MCP method

No SDK changes

Read-only

✅ Safe
✅ Required
✅ Zero risk

2️⃣ Index Status / Health Endpoint ✅

Why

MCP clients need to know if context is fresh

Augment exposes this implicitly

What to expose

indexing in progress

last indexed time

workspace hash

total indexed files

Concrete API

{
  "workspace": "/repo/path",
  "status": "idle | indexing",
  "lastIndexed": "2025-01-10T12:30:00Z",
  "fileCount": 1843
}


Implementation

Store metadata in memory or lightweight JSON

Do NOT touch embeddings or vectors

✅ Safe
✅ Recommended
✅ No SDK overlap

3️⃣ Workspace Lifecycle Commands ✅

Why

MCP expects explicit control tools

Commands

reindex_workspace

clear_index

Implementation

Simply call SDK methods

Clear = delegate to SDK’s index reset

✅ Safe
✅ MCP-aligned

PHASE 2 — AUTOMATION (WITHOUT BREAKING SDK)

These bring you closer to Augment behavior without becoming opinionated.

4️⃣ Realtime File Watching (Trigger Only) ✅

Why

Augment auto-refreshes index

SDK does NOT watch filesystem

What to implement

File watcher using chokidar

Detect add / change / delete

Queue affected files

Important constraint
❌ Do NOT reimplement chunking
❌ Do NOT store embeddings yourself

✅ Safe
✅ Recommended
✅ SDK-compatible

5️⃣ Incremental Reindex Orchestration ✅

Why

Full reindex is inefficient

SDK supports partial indexing

What you do

Maintain a “changed files queue”

Call SDK index for only those files

SDK still handles

hashing

chunking

persistence

✅ Safe
✅ High ROI
✅ No conflict

6️⃣ Debounce & Batch File Changes ✅

Why

Avoid reindex storms

Matches Augment’s behavior

Concrete behavior

300–500ms debounce

Batch file paths

One reindex call per batch

✅ Safe
✅ Performance only
✅ No semantic changes

PHASE 3 — NON-BLOCKING EXECUTION

Still recommended, still safe.

7️⃣ Background Indexing Worker ✅

Why

MCP server must stay responsive

Augment never blocks editor

What to implement

Worker thread or child process

Main server answers queries using last valid index

Index state

“stale but valid” until refresh completes

✅ Safe
✅ Recommended
✅ Clean separation

PHASE 4 — POLICY & TRANSPARENCY (ENTERPRISE-SAFE)

Strongly recommended by Augment docs.

8️⃣ Offline-Only / Policy Enforcement ✅

Why

Compliance

Clarity around cloud vs local

Concrete flag

ALLOW_REMOTE_EMBEDDINGS=false


Behavior

Fail fast if remote provider is configured

Log explicit warning

✅ Safe
✅ No SDK modification
✅ Important trust signal

9️⃣ Retrieval Audit Metadata ✅

Why

MCP promotes transparency

Helps debugging agents

What to return (optional field)

{
  "file": "src/auth.ts",
  "score": 0.91,
  "reason": "semantic match: token validation"
}


✅ Safe
✅ Read-only
✅ Does not affect retrieval

🚫 EXPLICITLY NOT INCLUDED (INTENTIONALLY)

These are NOT recommended or NOT safe at this stage:

❌ Custom vector DB
❌ Custom chunking
❌ Repo-local index storage
❌ Opinionated auto-retrieval per prompt
❌ Task-type inference (“fix vs refactor”)
❌ IDE-specific UX

(All of these either conflict with SDK or MCP neutrality.)

✅ FINAL IMPLEMENTATION CHECKLIST
✅ Implement these (in order)

Tool manifest (tools.list)

Index status / health API

Workspace lifecycle commands

File watcher (trigger only)

Incremental reindex orchestration

Debounce & batching

Background indexing worker

Offline-only policy enforcement

Retrieval audit metadata

✅ ONE-LINE SUMMARY

Everything above is recommended by Augment MCP, fully possible with your repo, and guaranteed not to break the SDK or architecture.