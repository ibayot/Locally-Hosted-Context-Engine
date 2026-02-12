# Context Engine v1.2.0 — Comprehensive Codebase Analysis Report

> **Analyst Persona**: BMAD Architect  
> **Scope**: Full end-to-end analysis (Ollama logic excluded per request)  
> **Date**: Generated during codebase review session  

---

## Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [Data Flow Diagram](#2-data-flow-diagram)
3. [MCP Server Conflict Investigation](#3-mcp-server-conflict-investigation)
4. [Context Engine Capabilities Assessment](#4-context-engine-capabilities-assessment)
5. [Corrections & Improvements](#5-corrections--improvements)
6. [BMAD Persona Integration Strategy](#6-bmad-persona-integration-strategy)
7. [Missing Components & Gaps](#7-missing-components--gaps)
8. [Long-Term Scalability Recommendations](#8-long-term-scalability-recommendations)

---

## 1. Architectural Overview

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│              LAYER 3: MCP Interface Layer                │
│    ┌──────────────┐  ┌────────────────────────────┐     │
│    │  server.ts    │  │  tools/ (33 tool files)    │     │
│    │  (MCP SDK)    │  │  plan, review, memory,     │     │
│    │  stdio        │  │  bmad, security, search... │     │
│    └──────┬───────┘  └─────────────┬──────────────┘     │
│           │                        │                     │
│    ┌──────┴────────────────────────┴──────────────┐     │
│    │          serviceClient.ts (3207 lines)        │     │
│    │   Adapter / Router / Cache / Policy Engine    │     │
│    └──────────────────┬───────────────────────────┘     │
├───────────────────────┼─────────────────────────────────┤
│              LAYER 2: Service Layer                      │
│    ┌─────────────────┴────────────────────────────┐     │
│    │  LocalContextService (service.ts)             │     │
│    │  PlanningService, ExecutionTrackingService     │     │
│    │  ReactiveReviewService                        │     │
│    └──────────────────┬───────────────────────────┘     │
├───────────────────────┼─────────────────────────────────┤
│              LAYER 1: Local Infrastructure               │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│    │ store.ts │ │embedding │ │astParser │ │ scanner  │ │
│    │ (vector) │ │ .ts      │ │ .ts      │ │ .ts      │ │
│    └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│    ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│    │watcher/  │ │metrics/  │ │ config/ (env,features)│  │
│    │FileWatch │ │metrics.ts│ │                       │  │
│    └──────────┘ └──────────┘ └───────────────────────┘  │
│    ┌──────────────────────────────────────────────┐     │
│    │  HTTP Server (httpServer.ts + Express routes) │     │
│    └──────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### Key Files by Size & Complexity

| File | Lines | Role |
|------|-------|------|
| `serviceClient.ts` | **3,207** | Central God-Object: caching, indexing, search, context bundling, file discovery, ignore patterns, token estimation, code type detection, memory retrieval |
| `plan.ts` | 1,225 | Planning tools: create, refine, visualize, execute plans |
| `reactiveReview.ts` | 784 | Reactive PR review with session management |
| `server.ts` | 718 | MCP server setup, tool registration, transport |
| `astParser.ts` | 538 | Regex-based code analysis |
| `ollamaProvider.ts` | 344 | Ollama LLM integration (disabled by default) |
| `store.ts` | 228 | Local vector store with cosine similarity |
| `service.ts` | 271 | LocalContextService core |
| `guidelines.ts` | 172 | BMAD persona definitions |
| `scanner.ts` | 116 | Security regex scanner |

### Version Discrepancy
- `package.json` declares **v1.2.0**
- `server.ts` line 668 prints **"Context Engine MCP Server v1.6.0"**
- This is a significant inconsistency and should be reconciled.

---

## 2. Data Flow Diagram

```
USER / AI AGENT
      │
      ▼ (JSON-RPC via stdio)
┌─────────────────────────┐
│  StdioServerTransport    │  ◄── MCP SDK @modelcontextprotocol/sdk
│  (stdin/stdout)          │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  ContextEngineMCPServer  │  server.ts
│  ├─ ListToolsHandler     │  → Returns 39 tool definitions
│  └─ CallToolHandler      │  → Switches on tool name
└────────┬────────────────┘
         │
         ▼ (delegates to tool handler functions)
┌─────────────────────────────────────────────┐
│  Tool Handlers (src/mcp/tools/*.ts)          │
│  ├─ handleIndexWorkspace                     │
│  ├─ handleSemanticSearch                     │
│  ├─ handleGetContextForPrompt                │
│  ├─ handleCreatePlan / handleExecutePlan     │
│  ├─ handleReactiveReviewPR                   │
│  ├─ handleScaffoldBmad                       │
│  ├─ handleAddMemory / handleListMemories     │
│  ├─ handleReviewChanges / handleReviewDiff   │
│  ├─ handleScanSecurity                       │
│  └─ ... (33 tool files total)                │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  ContextServiceClient (serviceClient.ts)     │
│  ├─ ensureInitialized()                      │──► LocalContextService.create()
│  ├─ indexWorkspace()                         │──► discoverFiles() → addToIndex()
│  │   ├─ loadIgnorePatterns()                 │      (batches of 10)
│  │   ├─ shouldIgnorePath() (minimatch)       │
│  │   ├─ readFileContents() (size/binary)     │
│  │   └─ hashContent() (SHA-256, skip-unch.)  │
│  ├─ semanticSearch()                         │──► 3-tier cache lookup:
│  │   ├─ in-memory (LRU, 5-min TTL)          │      1. Memory cache
│  │   ├─ persistent (disk, 4-hour TTL)        │      2. Persistent disk cache
│  │   └─ local.search() (embedding)           │      3. Embedding-based search
│  ├─ searchAndAsk()                           │──► SearchQueue (serialize AI calls)
│  ├─ getContextForPrompt()                    │──► Parallel file processing:
│  │   ├─ semanticSearch()                     │      snippets + related files
│  │   ├─ getRelevantMemories()                │      + summaries + hints
│  │   ├─ extractSmartSnippet()                │      → ContextBundle
│  │   └─ generateContextHints()               │
│  ├─ indexFiles() (incremental)               │──► enqueueIndexing()
│  └─ getFile() (path validation)              │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  LocalContextService (service.ts)            │
│  ├─ create() (factory)                       │
│  ├─ index() → store.addFile()                │
│  ├─ search() → store.search()                │  ──► cosine similarity
│  ├─ addToIndex()                             │
│  └─ exportToFile() / importFromFile()        │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  LocalVectorStore        │    │  LocalEmbeddingService   │
│  ├─ chunks: Chunk[]      │    │  @xenova/transformers    │
│  ├─ fileHashes: Map      │    │  "all-MiniLM-L6-v2"     │
│  ├─ addFile()            │◄──│  ├─ embed(text)          │
│  │   ├─ hashContent()    │    │  └─ retry logic (3x)    │
│  │   ├─ createChunks()   │    └─────────────────────────┘
│  │   └─ embeddingService │
│  ├─ search() (cosine)    │
│  ├─ removeFile()         │
│  └─ save() / load()      │
└─────────────────────────┘

SIDE CHANNELS:
┌─────────────────────────┐
│  FileWatcher (chokidar)  │  → Watches workspace for changes
│  ├─ debounce (500ms)     │  → Batches changes (max 100)
│  └─ hooks.onBatch()      │  → Triggers serviceClient.indexFiles()
└─────────────────────────┘

┌─────────────────────────┐
│  HTTP Server (Express)   │  → Additive layer on port 3333
│  ├─ /health              │  → Health check
│  ├─ /metrics             │  → Prometheus metrics
│  ├─ /api/v1/status       │  → Index status
│  └─ /api/v1/tools/*      │  → Tool invocation via REST
└─────────────────────────┘

┌─────────────────────────┐
│  ASTParser (regex)       │  → extractSymbols(), extractImports()
│  SecurityScanner (regex) │  → scanFile(): secrets + vulnerabilities
│  MetricsRegistry         │  → Prometheus-style counters/gauges/histograms
└─────────────────────────┘
```

### Data Storage Topology

```
workspace/
├── .augment-context-state.json     ← Index state (vector store serialized)
├── .augment-index-state.json       ← Per-file hash + timestamp tracking
├── .augment-index-fingerprint.json ← Cache invalidation fingerprint
├── .augment-search-cache.json      ← Persistent search cache (500 entries)
├── .augment-context-cache.json     ← Persistent context bundle cache (100 entries)
├── .memories/                      ← Cross-session memory storage
│   ├── preferences.md
│   ├── decisions.md
│   └── facts.md
├── .bmad/                          ← BMAD workflow documents
│   ├── 01_PRD.md
│   ├── 02_ARCH.md
│   └── 03_TASKS.md
└── .plans/                         ← Persisted plans (JSON files)
```

---

## 3. MCP Server Conflict Investigation

### 🔴 Root Cause Analysis: "Cannot Send Messages When MCP Server is Enabled"

The investigation reveals **three potential causes** for the conflict where Antigravity cannot send messages when the context-engine MCP server is enabled:

#### Cause 1: **stdio Transport Monopolization** (MOST LIKELY)

```typescript
// server.ts: line 663-665
async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
```

**Problem**: The MCP server uses `StdioServerTransport`, which takes **exclusive ownership of `stdin` and `stdout`**. The MCP protocol uses JSON-RPC over stdio, meaning:
- **`stdout`** is reserved for MCP responses (tool results, listings)
- **`stdin`** is reserved for MCP requests (tool calls)
- **Any non-MCP output to `stdout` will corrupt the JSON-RPC stream**

The codebase correctly uses `console.error()` (→ `stderr`) for all logging. However, the problem is that **the host application (Antigravity) also needs stdout/stdin** for its own messaging. When both the MCP server and Antigravity share the same process's stdio, they **compete for the same channels**.

**Evidence**:
- Line 671: `console.error('Transport: stdio');` — confirms stdio transport
- All user-facing output goes through MCP's stdout channel
- No alternative transport (SSE, WebSocket) is used for the MCP connection

#### Cause 2: **Blocking Auto-Indexing on Startup**

```typescript
// serviceClient.ts: lines 1161-1178
if (!this.skipAutoIndexOnce && !options?.skipAutoIndex) {
    console.error('No existing index found - auto-indexing workspace...');
    try {
        await this.indexWorkspace(); // ← BLOCKS EVENT LOOP
```

**Problem**: When the server starts for the first time (no existing index), `doInitialize()` triggers a **synchronous, potentially long-running indexing operation** that blocks the Node.js event loop. During this time:
- The MCP server cannot process incoming requests
- The host application receives no responses
- This appears as a "frozen" or "unresponsive" server

#### Cause 3: **SearchQueue Serialization Deadlock Potential**

```typescript
// serviceClient.ts: SearchQueue.processQueue()
private async processQueue(): Promise<void> {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    // ... processes one item at a time
}
```

**Problem**: The `SearchQueue` serializes ALL AI API calls, meaning only one runs at a time. If the MCP host sends multiple tool calls that all go through `searchAndAsk()`, they queue up. Combined with a timeout (configurable, default from env), this creates **perceived blocking**.

### 🟢 Recommended Fix

```typescript
// Fix 1: Add SSE/HTTP transport option alongside stdio
// In server.ts, add:
async run(options?: { transport?: 'stdio' | 'sse' }): Promise<void> {
    if (options?.transport === 'sse') {
        // Use SSE transport for non-blocking communication
        const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
        const app = express();
        const transport = new SSEServerTransport('/mcp', app);
        await this.server.connect(transport);
        app.listen(3334);
    } else {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}

// Fix 2: Make auto-indexing non-blocking
// In serviceClient.ts doInitialize():
if (!this.skipAutoIndexOnce && !options?.skipAutoIndex) {
    // Don't await - let indexing run in background
    this.indexWorkspace().catch(error => {
        console.error('Background auto-indexing failed:', error);
    });
    // Server is immediately available for requests
}

// Fix 3: Add queue depth limits + backpressure
// In SearchQueue:
private readonly maxQueueDepth = 10;
async enqueue<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    if (this.queue.length >= this.maxQueueDepth) {
        throw new Error('Search queue full - too many concurrent requests');
    }
    // ... existing logic
}
```

---

## 4. Context Engine Capabilities Assessment

### 4.1 Inputs

| Input | Source | Method |
|-------|--------|--------|
| Workspace files | Filesystem | `discoverFiles()` recursive scan |
| User queries | MCP tool calls | `semantic_search`, `get_context_for_prompt` |
| Git context | Git CLI | `git log`, `git diff`, `git show` |
| Memory entries | `.memories/*.md` | Markdown files appended over sessions |
| Ignore patterns | `.gitignore`, `.contextignore` | Parsed on first access |
| Environment config | `.env`, env vars | `envBool()`, `envInt()`, `envMs()` |

### 4.2 Outputs

| Output | Format | Destination |
|--------|--------|-------------|
| Search results | `SearchResult[]` (JSON) | MCP response → agent |
| Context bundles | `ContextBundle` (structured) | MCP response → agent |
| Plans | `EnhancedPlanOutput` (JSON) | MCP response + `.plans/` |
| Code reviews | Markdown + structured findings | MCP response |
| Security scans | `SecurityIssue[]` | MCP response |
| AST analysis | `FileAnalysis` (symbols, imports) | MCP response |
| BMAD scaffolds | Markdown template files | `.bmad/` directory |
| Metrics | Prometheus text format | `/metrics` endpoint |

### 4.3 Storage & Retrieval

| Store | Type | Capacity | TTL |
|-------|------|----------|-----|
| Vector store | In-memory (serialized to JSON) | Unlimited (all workspace chunks) | Persistent |
| In-memory search cache | `Map<string, CacheEntry>` | **100 entries** (LRU) | **5 minutes** |
| Persistent search cache | JSON file on disk | **500 entries** (LRU) | **4 hours** |
| Persistent context cache | JSON file on disk | **100 entries** (LRU) | **4 hours** |
| Index state store | JSON file (`file → hash`) | One entry per file | Persistent |
| Memories | Markdown files | Unlimited | Persistent |
| Plans | JSON files in `.plans/` | Unlimited | Persistent |

### 4.4 Memory Strategy

- **Cross-session**: `.memories/` directory with 3 categories (preferences, decisions, facts)
- **Semantic retrieval**: Memories are indexed and searched alongside code context
- **Auto-inclusion**: `getContextForPrompt()` automatically fetches relevant memories
- **Budget-aware**: Memory retrieval respects token budget allocation
- **Limitation**: No memory expiration, deduplication, or relevance decay

### 4.5 Tool Orchestration (39 Tools)

| Category | Tools | Status |
|----------|-------|--------|
| **Core Context** | `index_workspace`, `semantic_search`, `codebase_retrieval`, `get_context_for_prompt`, `enhance_prompt`, `get_file` | ✅ Active |
| **Index Management** | `index_status`, `reindex_workspace`, `clear_index`, `tool_manifest` | ✅ Active |
| **Memory** | `add_memory`, `list_memories` | ✅ Active |
| **Planning** | `create_plan`, `refine_plan`, `visualize_plan`, `save_plan`, `load_plan`, `list_plans`, `delete_plan`, `request_approval`, `respond_approval`, `start_step`, `complete_step`, `fail_step`, `view_progress`, `view_history`, `compare_plan_versions`, `rollback_plan` | ✅ Active |
| **Code Review** | `review_changes`, `review_git_diff`, `review_diff`, `review_auto`, `check_invariants`, `run_static_analysis` | ✅ Active |
| **Reactive Review** | `reactive_review_pr`, `get_review_status`, `pause_review`, `resume_review`, `get_review_telemetry`, `scrub_secrets`, `validate_content` | ⚠️ Requires env flags |
| **BMAD** | `scaffold_bmad`, `get_bmad_guidelines` | ✅ Active |
| **Code Analysis** | `find_symbol`, `dependency_graph`, `code_metrics`, `project_structure`, `find_todos`, `git_context`, `file_stats`, `scan_security`, `duplicate_detector` | ✅ Active |

### 4.6 Reasoning Pipeline

```
Query → SemanticSearch → Filter(minRelevance) → Deduplicate(by file)
  → Rank(by relevance) → SmartSnippetExtraction(priority-based)
  → TokenBudgetEnforcement → ParallelFileProcessing
  → RelatedFileDiscovery → MemoryRetrieval
  → ContextHints → ContextSummary → ContextBundle
```

### 4.7 Bottlenecks Identified

1. **`serviceClient.ts` is a 3,207-line God Object** — violates Single Responsibility
2. **Synchronous file I/O** in `discoverFiles()` uses `fs.readdirSync()`, `fs.readFileSync()`
3. **Embedding generation is single-threaded** — no worker thread parallelism
4. **No streaming support** — entire context bundles materialized in memory
5. **Regex-based AST parser** — misses many language constructs, no type resolution
6. **No connection pooling** for Ollama HTTP calls
7. **Cache invalidation is coarse-grained** — any re-index clears ALL caches

---

## 5. Corrections & Improvements

### 5.1 Architecture-Level Fixes

#### A. Break Up the God Object (`serviceClient.ts`)

The 3,207-line `ContextServiceClient` class handles too many responsibilities:

```
serviceClient.ts → Split into:
├── IndexingService.ts        (discoverFiles, indexWorkspace, indexFiles)
├── SearchService.ts          (semanticSearch, searchAndAsk, parseFormattedResults)
├── CacheService.ts           (all caching: memory, persistent, context bundle)  
├── ContextBundleService.ts   (getContextForPrompt, extractSmartSnippet, hints)
├── FileService.ts            (getFile, validateFilePath, readFileContents)
├── IgnorePatternService.ts   (loadIgnorePatterns, shouldIgnorePath)
└── ContextServiceClient.ts   (thin facade delegating to above services)
```

#### B. Add a Service Registry / Dependency Injection

Currently, services are instantiated via "lazy singleton" patterns with `WeakRef` hacks:

```typescript
// Current (fragile):
let cachedPlanningService: PlanningService | null = null;
let cachedServiceClientRef: WeakRef<ContextServiceClient> | null = null;

// Better: Use a simple DI container
class ServiceRegistry {
    private services = new Map<string, any>();
    register<T>(key: string, factory: () => T): void { ... }
    get<T>(key: string): T { ... }
}
```

### 5.2 Logic-Level Fixes

#### A. Version Mismatch

```typescript
// server.ts line 668:
console.error('Context Engine MCP Server v1.6.0');  // ← WRONG

// package.json:
"version": "1.2.0"  // ← This is the source of truth

// FIX: Read version from package.json dynamically
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');
console.error(`Context Engine MCP Server v${pkg.version}`);
```

#### B. `doInitialize()` State File Logic Bug

```typescript
// serviceClient.ts lines 1112-1129
if (fs.existsSync(stateFilePath)) {
    console.error(`Restoring context from ${stateFilePath}`);
    console.log('[LocalContextService] State file exists...');  // ← WRONG: uses console.log!
    console.error('Context restored successfully');
    // ... updates status and RETURNS
    return;  // ← BUG: Returns without actually creating this.context!
}
```

**Bug**: When a state file exists, `doInitialize()` logs "context restored" and returns **without ever setting `this.context`**. The next call to `ensureInitialized()` will return `this.context` which is still `null`, causing a runtime crash.

**Fix**:
```typescript
if (fs.existsSync(stateFilePath)) {
    this.context = await LocalContextService.create(this.workspacePath);
    this.restoredFromStateFile = true;
    // ... update status
}
```

#### C. `console.log()` Usage in stdio Context

Line 1116 uses `console.log()` which writes to **stdout** — this will corrupt the MCP JSON-RPC stream:

```typescript
// BUG: This corrupts the MCP transport
console.log('[LocalContextService] State file exists, will be loaded during creation.');

// FIX: Use console.error for all logging
console.error('[LocalContextService] State file exists, will be loaded during creation.');
```

#### D. Synchronous File I/O in Hot Paths

```typescript
// serviceClient.ts line 1229:
const entries = fs.readdirSync(dirPath, { withFileTypes: true });  // BLOCKS event loop

// FIX: Use async version
const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
```

### 5.3 Error Handling Improvements

#### A. Silent Error Swallowing

Many `catch` blocks silently discard errors:

```typescript
// Multiple instances like:
} catch {
    // Ignore parse errors
}

// Better:
} catch (err) {
    console.error(`[warn] Parse error for ${path}: ${err}`);
    // Still continue, but at least log it
}
```

#### B. Missing Input Validation in Tool Handlers

Several tool handlers have incomplete validation:

```typescript
// In server.ts, the global handler:
switch (name) {
    case 'index_workspace':
        result = await handleIndexWorkspace(args as any, this.serviceClient);
        //                                    ^^^^^^^ unsafe cast
```

**Fix**: Add runtime validation with proper type guards or a schema validator (like `zod`).

### 5.4 Concurrency Fixes

#### A. Index Chain Race Condition

```typescript
// serviceClient.ts:
private indexChain: Promise<unknown> = Promise.resolve();
private enqueueIndexing<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.indexChain.then(fn, fn);  // ← fn runs on BOTH resolve/reject
    this.indexChain = run.then(() => undefined, () => undefined);
    return run;
}
```

**Issue**: `fn` runs regardless of whether the previous indexing succeeded or failed (the second `fn` argument to `.then(fn, fn)` means it runs on rejection too). This is intentional for sequential ordering but masks errors from prior operations.

#### B. FileWatcher Concurrent Flush

The `requestFlush()` method has a subtle issue:

```typescript
private async requestFlush(): Promise<void> {
    if (this.flushInFlight) {
        this.flushQueued = true;  // ← Only ONE pending flush tracked
        return;
    }
```

If events arrive rapidly, only the **last** queued flush is honored, potentially missing intermediate change batches.

### 5.5 Configuration Improvements

#### A. Environment Variable Sprawl

The system uses **27+ environment variables** with inconsistent naming:

```
CE_DEBUG_INDEX, CE_DEBUG_SEARCH, CE_INDEX_BATCH_SIZE,
CE_AI_REQUEST_TIMEOUT_MS, CE_PERSIST_SEARCH_CACHE,
CE_PERSIST_CONTEXT_CACHE,
CONTEXT_ENGINE_OFFLINE_ONLY,
REACTIVE_ENABLED, REACTIVE_PARALLEL_EXEC, REACTIVE_MAX_WORKERS,
REACTIVE_COMMIT_CACHE,
AUGMENT_API_URL, AUGMENT_API_TOKEN,
OLLAMA_URL, OLLAMA_MODEL,
JEST_WORKER_ID,
...
```

**Fix**: Centralize into a typed configuration object:

```typescript
interface ContextEngineConfig {
    debug: { index: boolean; search: boolean };
    indexing: { batchSize: number; maxFileSize: number };
    cache: { persistSearch: boolean; persistContext: boolean; ttlMs: number };
    reactive: { enabled: boolean; parallelExec: boolean; maxWorkers: number };
    api: { url?: string; token?: string; timeoutMs: number };
    offline: boolean;
}
```

### 5.6 MCP Compatibility Corrections

#### A. Tool Schema Compliance

Some tool schemas use non-standard properties:

```typescript
// In memory.ts tool definition:
required: [],  // ← Should omit or use proper empty array

// Some tools have 'default' in schemas which is
// supported by JSON Schema but should be validated
```

#### B. Error Response Format

The server returns errors as plain text instead of structured MCP errors:

```typescript
// Current:
return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };

// Better: Include error code for programmatic handling
return {
    content: [{ type: 'text', text: JSON.stringify({ error: errorMessage, code: 'TOOL_EXECUTION_FAILED' }) }],
    isError: true,
};
```

---

## 6. BMAD Persona Integration Strategy

### Current State

BMAD is implemented as **static string templates** in `guidelines.ts` with 9 personas:

| Persona | Phase | Deliverable |
|---------|-------|-------------|
| Product Owner | 0 (Discovery) | `00_VISION.md` |
| Product Manager / Analyst | 1 (Planning) | `01_PRD.md` |
| UI/UX Designer | 1b (Design) | `01_DESIGN.md` |
| System Architect | 2 (Architecture) | `02_ARCH.md` |
| Security Engineer | 2a (Security) | `02_SECURITY.md` |
| Scrum Master | 2b (Sprint Planning) | `03_TASKS.md` |
| Senior Developer | 3 (Development) | Implementation |
| QA Lead / SDET | 4 (Verification) | `04_TEST_PLAN.md` |
| DevOps / SRE | 5 (Operations) | `05_OPS.md` |

### Gap Analysis

1. **Personas are just strings** — no behavioral rules, no validation, no context injection
2. **Only 3 files scaffolded** (`01_PRD.md`, `02_ARCH.md`, `03_TASKS.md`) out of 7 possible
3. **No phase gating** — nothing prevents jumping from PRD to code without architecture
4. **No persona-context coupling** — the `get_context_for_prompt` tool doesn't inject persona-specific guidance
5. **No workflow state** — the system doesn't track which phase the project is in

### Proposed Persona Integration Architecture

```
┌─────────────────────────────────────────────────┐
│  BMAD Orchestration Layer (NEW)                  │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ PersonaEngine │  │ WorkflowStateMachine     │  │
│  │ ├─ activate() │  │ ├─ currentPhase          │  │
│  │ ├─ validate() │  │ ├─ canTransition()       │  │
│  │ └─ inject()   │  │ ├─ getRequiredArtifacts()│  │
│  └──────────────┘  └─────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ PersonaContextInjector                    │   │
│  │ ├─ getSystemPromptForPersona()            │   │
│  │ ├─ getToolRestrictions()                  │   │
│  │ └─ getArtifactTemplates()                 │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**New Tools to Add:**

```typescript
// 1. activate_persona - Set the active BMAD persona
{
    name: 'activate_persona',
    description: 'Activate a BMAD persona for the current session',
    inputSchema: {
        properties: {
            persona: {
                type: 'string',
                enum: ['product_owner', 'analyst', 'architect', 'security_engineer',
                       'scrum_master', 'developer', 'qa_lead', 'devops', 'ui_ux_designer']
            }
        }
    }
}

// 2. get_workflow_status - Show current BMAD phase & required artifacts
{
    name: 'get_workflow_status',
    description: 'Show the current BMAD workflow phase, completed artifacts, and next steps'
}

// 3. validate_artifact - Validate a BMAD artifact against its template
{
    name: 'validate_artifact',
    description: 'Validate a BMAD artifact (PRD, ARCH, TASKS) for completeness'
}
```

**Persona Context Injection** (enhance `get_context_for_prompt`):

```typescript
async getContextForPrompt(query: string, options?: ContextOptions): Promise<ContextBundle> {
    const bundle = await this._originalGetContext(query, options);
    
    // Inject persona-specific guidance
    if (this.activePersona) {
        bundle.systemPrompt = this.personaEngine.getSystemPromptForPersona(this.activePersona);
        bundle.hints.unshift(`Active persona: ${this.activePersona}`);
        bundle.toolRestrictions = this.personaEngine.getToolRestrictions(this.activePersona);
    }
    
    return bundle;
}
```

---

## 7. Missing Components & Gaps

### 7.1 Missing Architectural Components

| Component | Priority | Description |
|-----------|----------|-------------|
| **Request ID Tracking** | 🔴 High | No correlation between MCP requests for debugging |
| **Rate Limiting** | 🔴 High | No protection against rapid tool calls |
| **Health Check (MCP-level)** | 🔴 High | No MCP-native health/readiness signal |
| **Schema Validation Layer** | 🟡 Medium | Tool args cast with `as any` — no runtime validation |
| **Event Bus / Pub-Sub** | 🟡 Medium | Components communicate via direct calls, no loose coupling |
| **Structured Logging** | 🟡 Medium | All logging via `console.error()` with no structure |
| **Circuit Breaker** | 🟡 Medium | No protection for external service failures |
| **Graceful Degradation** | 🟡 Medium | If embedding fails, entire search fails |

### 7.2 Missing Abstractions

1. **No `EmbeddingProvider` interface** — hardcoded to `@xenova/transformers`. Should abstract to allow swapping models
2. **No `StorageProvider` interface** — hardcoded to JSON file storage. Should support SQLite, LMDB, etc.
3. **No `TransportProvider` interface** — hardcoded to stdio + optional HTTP. Should support WebSocket, SSE
4. **No `CodeAnalyzer` interface** — hardcoded to regex parser. Should support tree-sitter, LSP

### 7.3 Missing Orchestration

- No **task queue with priorities** (all tool calls are equal priority)
- No **tool dependency graph** (tool A should run before tool B)
- No **batch tool execution** (run multiple tools in one MCP request)
- No **progress streaming** (long operations return only when complete)

### 7.4 Missing Validation

- **Memory entries** have a 5000-char limit but no content sanitization
- **Plan JSON** is parsed with `JSON.parse()` without schema validation
- **File paths** are validated but not sanitized (could contain special chars)
- **Git commands** are executed without input escaping

### 7.5 Missing Logging & Monitoring

- No **structured log format** (JSON logs for ingestion)
- No **request tracing** (no correlation IDs)
- No **performance budgets** (no alerts when operations exceed thresholds)
- Prometheus metrics are **disabled by default** and only exposed via HTTP (not MCP)

### 7.6 Missing Memory Management

- **No memory pruning** — memories accumulate indefinitely
- **No duplicate detection** — same memory can be added repeatedly
- **No relevance decay** — old memories have equal weight to new ones
- **No memory versioning** — no history of memory changes
- **No cross-workspace memory** — memories are per-workspace only

---

## 8. Long-Term Scalability Recommendations

### 8.1 Modularity

- **Plugin system**: Allow tools to be loaded dynamically from a `plugins/` directory
- **Tool groups**: Allow enabling/disabling tool categories via config
- **Extension API**: Define interfaces for community extensions

### 8.2 Extensibility

- **Custom embedding models**: Support ONNX, HuggingFace, or remote APIs
- **Custom analyzers**: Allow tree-sitter grammars per language
- **Custom storage**: SQLite for production, Redis for distributed setups

### 8.3 Observability

```
Recommended Stack:
├── Structured logging (pino/winston) → JSON to stderr
├── OpenTelemetry traces → Tool call spans
├── Prometheus metrics → Already started, needs expansion
├── Health endpoint → Liveness + readiness probes
└── Error reporting → Sentry/Bugsnag integration
```

### 8.4 Performance

- **Worker threads** for embedding generation (CPU-bound)
- **Streaming responses** for large context bundles
- **Incremental parsing** — only re-parse changed files
- **SQLite** for vector storage (much faster than JSON serialization)
- **Content-addressed caching** — cache by content hash, not query string

### 8.5 Security

- **Input sanitization** for all tool arguments
- **Content Security Policy** for HTTP server
- **Sandboxed execution** for plan execution (file writes)
- **Audit logging** for all state-modifying operations
- **Secret rotation** — clear all in-memory secrets on shutdown

### 8.6 Multi-Agent Readiness

- **Session management** — multiple agents should be able to connect simultaneously
- **Conflict resolution** — handle concurrent plan modifications
- **Agent identity** — tag memories/plans with agent ID
- **Broadcast events** — notify all connected agents of workspace changes

### 8.7 Context Management Efficiency

- **Hierarchical chunking** — file → class → function → block (not just fixed-size chunks)
- **Importance scoring** — weight exports/public APIs higher
- **Dependency-aware context** — include callers/callees of relevant code
- **Context compression** — summarize low-relevance snippets instead of including full text
- **Adaptive token budgets** — allocate more tokens to highly relevant files

---

## Summary of Critical Findings

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| 1 | **stdio transport monopolizes stdout** — prevents host app messaging | 🔴 Critical | `server.ts:664` |
| 2 | **`console.log()` corrupts MCP stream** | 🔴 Critical | `serviceClient.ts:1116` |
| 3 | **`doInitialize()` returns without setting `this.context`** when state file exists | 🔴 Critical | `serviceClient.ts:1112-1129` |
| 4 | **Version mismatch** (1.2.0 vs 1.6.0) | 🟡 Medium | `server.ts:668` vs `package.json` |
| 5 | **Synchronous file I/O** blocks event loop during indexing | 🟡 Medium | `serviceClient.ts:1229` |
| 6 | **3,207-line God Object** violates SRP | 🟡 Medium | `serviceClient.ts` |
| 7 | **No input validation** — unsafe `as any` casts | 🟡 Medium | `server.ts:CallToolHandler` |
| 8 | **Silent error swallowing** throughout codebase | 🟡 Medium | Multiple files |
| 9 | **Missing BMAD phase gating** | 🟢 Enhancement | `scaffoldBmad.ts` |
| 10 | **No memory pruning/dedup** | 🟢 Enhancement | `memory.ts` |

---

*End of Analysis Report*
