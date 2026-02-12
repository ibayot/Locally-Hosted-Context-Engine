# Context Engine v1.3.0 Roadmap: "A-Grade" MCP Server

This document outlines the technical debt pay-down and improvements required to elevate the Context Engine from "Production Ready" (Grade B+) to "Enterprise Grade" (Grade A).

**Focus**: Reliability, Type Safety, Maintainability, and Observability.
**Target Release**: v1.3.0
**Estimated Effort**: ~12 hours

---

## 📋 High-Level Objective List

| Priority | Task | Impact | Complexity | Est. Time |
|----------|------|--------|------------|-----------|
| **1** | **Add Zod Validation** | 🛡️ High | Medium | 2 hrs |
| **2** | **Add Typed Interfaces** | 🛡️ High | Low | 1 hr |
| **3** | **Health Endpoint (HTTP)** | 🔍 Low | Low | 15 mins |
| **4** | **Async I/O Migration** | ⚡ Medium | Medium | 2 hrs |
| **5** | **Structured Logging** | 📊 Medium | Medium | 2 hrs |
| **6** | **Refactor God Object** | 🏗️ High | High | 4 hrs |

---

## 🛠️ Detailed Implementation Plan

### 1. Zod Validation on Tool Arguments (Top Priority)
**Problem**: Currently, tool arguments are cast `as any`. If an agent sends a string where a number is expected, the server might crash or behave unpredictably deep in the logic.
**Solution**: Use `zod` schemas to validate inputs *before* business logic runs.

**Implementation Steps**:
1.  Install `zod`: `npm install zod`
2.  Define schemas for all 27 core tools in a new `src/mcp/schemas.ts` file.
3.  Update `server.ts` to parse arguments using `.parse()` or `.safeParse()`.

**Code Example**:
```typescript
// src/mcp/schemas.ts
import { z } from 'zod';

export const SemanticSearchSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  top_k: z.number().int().min(1).max(50).default(10),
  filter: z.string().optional()
});

// src/mcp/server.ts
case 'semantic_search':
  const validated = SemanticSearchSchema.parse(args); // Throws clean error if invalid
  result = await handleSemanticSearch(validated, this.serviceClient);
  break;
```

---

### 2. Replace `as any` with Typed Interfaces
**Problem**: The codebase is littered with `(args as any)`, bypassing TypeScript's safety checks. This hides bugs during development.
**Solution**: Replace `any` with the inferred types from the Zod schemas (Task #1) or explicit interfaces.

**Implementation Steps**:
1.  Use `z.infer<typeof Schema>` to generate types automatically from Task #1.
2.  Update all `handle*` functions in `src/mcp/tools/*.ts` to accept these typed arguments instead of `any` or `Record<string, unknown>`.

**Code Example**:
```typescript
// src/mcp/tools/search.ts
import { z } from 'zod';
import { SemanticSearchSchema } from '../schemas';

type SemanticSearchArgs = z.infer<typeof SemanticSearchSchema>;

export async function handleSemanticSearch(args: SemanticSearchArgs, client: ContextServiceClient) {
  // TypeScript now knows args.top_k is a number!
}
```

---

### 3. Add Health Endpoint to HTTP Mode
**Problem**: In HTTP mode, there's no easy way for a load balancer or monitoring tool to know if the server is "up" without executing a tool.
**Solution**: Add a lightweight GET `/health` endpoint.

**Implementation Steps**:
1.  In `server.ts` `run()` method (HTTP section), add an Express route.
2.  Return JSON with status, version, and basic index stats.

**Code Example**:
```typescript
app.get('/health', (_req, res) => {
  const status = this.serviceClient.getIndexStatus();
  res.json({
    status: 'ok',
    version: pkg.version,
    uptime: process.uptime(),
    indexing: status.status
  });
});
```

---

### 4. Split `serviceClient.ts` into Focused Services
**Problem**: `serviceClient.ts` is a "God Object" with 3200+ lines. It handles indexing, searching, file I/O, state management, and configuration. This makes it hard to test and modify.
**Solution**: Extract logic into domain-specific service classes using Dependency Injection.

**Implementation Steps**:
1.  Create `src/mcp/services/` directory.
2.  Extract classes one by one:
    *   `IndexingService`: `indexWorkspace`, `indexFiles`, `reindex`
    *   `SearchService`: `semanticSearch`, `retrieveContext`
    *   `FileService`: `getFile`, `fileStats`, `projectStructure`
    *   `StateService`: `saveState`, `loadState`, `contextBundles`
3.  Refactor `ContextServiceClient` to coordinate these smaller services instead of doing everything itself.

---

### 5. Replace Synchronous I/O with `fs.promises`
**Problem**: The server uses `fs.readFileSync`, `fs.writeFileSync`, etc. This blocks the NodeJS event loop. In a single-user CLI, this is fine. In a server handling multiple requests (HTTP mode), this kills performance.
**Solution**: Migrate all file operations to `fs.promises` (async/await).

**Implementation Steps**:
1.  Indentify all Sync calls: `grep "Sync" src/**/*.ts`
2.  Replace with `await fs.promises.*` or `check_tools.ts` helpers.
3.  Update function signatures to be `async` where necessary (most already are).

---

### 6. Structured Logging with Pino
**Problem**: `console.error` logs unstructured text. This is hard to parse in production logs or dashboards (OpenTelemetry, Datadog).
**Solution**: Use a structured logger like `pino`.

**Implementation Steps**:
1.  Install: `npm install pino`
2.  Create a singleton logger instance in `src/logger.ts`.
3.  Replace `console.error` calls with `logger.info()`, `logger.error()`, etc.
4.  (Optional) Add request ID tracking to correlate logs.

**Code Example**:
```typescript
import pino from 'pino';
export const logger = pino({
  name: 'context-engine',
  level: process.env.LOG_LEVEL || 'info'
});

// Usage
logger.info({ tool: 'semantic_search', query: 'auth', duration_ms: 45 }, 'Search completed');
// Output: {"level":30,"time":163...,"tool":"semantic_search","query":"auth","duration_ms":45,"msg":"Search completed"}
```
