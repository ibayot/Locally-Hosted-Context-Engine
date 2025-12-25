# VS Code Extension — Safe Implementation Plan

> **Document Purpose**: Step-by-step implementation plan for developing the Context Engine VS Code extension without disrupting existing MCP server functionality.

---

## Executive Summary

This plan implements the VS Code extension as a **pure UI layer** that communicates with the existing Context Engine MCP server. The approach prioritizes:

1. **Zero disruption** to existing stdio-based MCP clients (Codex, Claude, Antigravity)
2. **Additive HTTP transport** layer without modifying core logic
3. **Incremental rollout** with feature flags and rollback points
4. **Comprehensive testing** at each phase

---

## 1. Risk Assessment

### 1.1 High-Risk Areas

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking stdio transport | Critical | Medium | Separate HTTP server module, no changes to `server.ts` |
| Corrupting workspace index | High | Low | Read-only operations initially, index backup before writes |
| API contract changes | High | Medium | Freeze MCP tool signatures, version all APIs |
| Concurrent access conflicts | Medium | Medium | Add request queuing, implement mutex for index ops |
| Memory leaks from long-running server | Medium | High | Implement health checks, auto-restart mechanisms |

### 1.2 Low-Risk Areas

| Area | Reason |
|------|--------|
| VS Code extension itself | Completely isolated, no server dependencies |
| UI components | Pure frontend, no backend modifications |
| Settings/configuration | Additive only, backward compatible |

### 1.3 Critical Constraints

```
┌─────────────────────────────────────────────────────────────────┐
│                    DO NOT MODIFY                                │
├─────────────────────────────────────────────────────────────────┤
│ • src/mcp/server.ts (stdio transport logic)                    │
│ • src/mcp/serviceClient.ts (core service layer)                │
│ • src/mcp/tools/*.ts (tool implementations)                    │
│ • Existing MCP tool schemas                                     │
│ • package.json scripts that existing clients use               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Overview

### 2.1 Current Architecture (Preserved)

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Clients (Existing)                    │
│            Codex CLI  ·  Claude  ·  Antigravity             │
└─────────────────────────▲───────────────────────────────────┘
                          │ stdio (preserved)
┌─────────────────────────┴───────────────────────────────────┐
│                 context-engine (UNCHANGED)                   │
│        server.ts → serviceClient.ts → tools/*.ts            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Extended Architecture (New)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         All Clients                                        │
├────────────────────────┬──────────────────────────────────────────────────┤
│    Existing Clients    │              New Clients                          │
│  (Codex, Claude, etc.) │    VS Code Extension · Future HTTP Clients       │
└───────────▲────────────┴──────────────────────▲────────────────────────────┘
            │ stdio (unchanged)                 │ HTTP (new)
┌───────────┴───────────────────────────────────┴────────────────────────────┐
│                          context-engine                                     │
├────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐                              │
│  │   Stdio Server   │    │   HTTP Server    │   ◄── NEW (isolated)        │
│  │   (server.ts)    │    │   (httpServer.ts)│                              │
│  └────────┬─────────┘    └────────┬─────────┘                              │
│           │                       │                                         │
│           └───────────┬───────────┘                                         │
│                       ▼                                                     │
│  ┌────────────────────────────────────────┐                                │
│  │      ContextServiceClient (shared)     │   ◄── UNCHANGED               │
│  └────────────────────────────────────────┘                                │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Development Phases

### Phase 0: Preparation (Week 1)
**Goal**: Establish safe development environment

#### Tasks:
- [ ] Create `vscode-extension/` directory (isolated from server code)
- [ ] Set up VS Code extension scaffolding with `yo code`
- [ ] Configure separate `package.json` for extension
- [ ] Create development branch: `feature/vscode-extension`
- [ ] Set up CI pipeline for extension (separate from server)
- [ ] Document rollback procedures

#### Rollback Point: Delete `vscode-extension/` directory

---

### Phase 1: HTTP Transport Layer (Week 2-3)
**Goal**: Add HTTP server without modifying existing code

#### File Structure:
```
src/
├── index.ts                    # Entry point (add --http flag)
├── http/                       # NEW directory
│   ├── httpServer.ts          # Express HTTP server
│   ├── routes/                # HTTP routes
│   │   ├── tools.ts           # /tools/* endpoints
│   │   ├── status.ts          # /status endpoint
│   │   └── health.ts          # /health endpoint
│   └── middleware/            # Express middleware
│       ├── cors.ts            # CORS for VS Code
│       ├── logging.ts         # Request logging
│       └── errorHandler.ts    # Error handling
└── mcp/                        # UNCHANGED
```

#### Tasks:
- [ ] Create `src/http/httpServer.ts` (new file, no modifications to existing)
- [ ] Implement HTTP routes that delegate to `ContextServiceClient`
- [ ] Add `--http` and `--port` CLI flags to `src/index.ts`
- [ ] Ensure HTTP server uses same `ContextServiceClient` instance
- [ ] Add CORS middleware for VS Code extension access
- [ ] Implement request/response logging
- [ ] Write integration tests for HTTP endpoints

#### API Endpoints (REST-like):
```
GET  /health                     → { status: "ok", version: "1.x.x" }
GET  /api/v1/status              → index_status() response
POST /api/v1/index               → index_workspace() response
POST /api/v1/search              → semantic_search() response
POST /api/v1/codebase-retrieval  → codebase_retrieval() response
POST /api/v1/enhance-prompt      → enhance_prompt() response
POST /api/v1/planning            → planning() response
```

#### Backward Compatibility Check:
```bash
# Before Phase 1 release, verify stdio still works:
node dist/index.js --workspace . --index   # Must work unchanged
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

#### Rollback Point: Revert `src/index.ts` changes, delete `src/http/`

---

### Phase 2: VS Code Extension Shell (Week 4-5)
**Goal**: Create minimal extension that can communicate with HTTP server

#### File Structure:
```
vscode-extension/
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript config
├── src/
│   ├── extension.ts           # Main entry point
│   ├── client/
│   │   └── contextEngineClient.ts  # HTTP client
│   ├── providers/
│   │   └── statusBarProvider.ts    # Status bar item
│   └── commands/
│       └── index.ts           # Command registration
├── resources/
│   └── icons/                 # Extension icons
└── test/
    └── extension.test.ts      # Extension tests
```

#### Tasks:
- [ ] Initialize extension with `yo code --extensionType=ts`
- [ ] Create `ContextEngineClient` class for HTTP communication
- [ ] Add basic connection status indicator
- [ ] Implement "Connect to Server" command
- [ ] Implement "Show Index Status" command
- [ ] Configure settings for `contextEngine.serverUrl`
- [ ] Test extension loads without errors
- [ ] Test connection to local HTTP server

#### Extension Manifest (`package.json`):
```json
{
  "name": "context-engine",
  "displayName": "Context Engine",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "configuration": {
      "title": "Context Engine",
      "properties": {
        "contextEngine.serverUrl": {
          "type": "string",
          "default": "http://localhost:3333",
          "description": "Context Engine server URL"
        },
        "contextEngine.autoStart": {
          "type": "boolean",
          "default": false,
          "description": "Auto-start server on extension activation"
        }
      }
    }
  }
}
```

#### Rollback Point: Uninstall extension from VS Code, delete directory

---

### Phase 3: Core UI Features (Week 6-8)
**Goal**: Implement sidebar actions and toolbar icons

#### Tasks:
- [ ] Create Activity Bar icon and view container
- [ ] Implement Sidebar TreeView with actions:
  - ✨ Enhance Prompt
  - 🧠 Planning Mode
  - 🔍 Semantic Search
  - 📦 Codebase Retrieval
- [ ] Add toolbar icons (magic wand, brain)
- [ ] Implement Quick Pick input for searches
- [ ] Create output channel for results
- [ ] Implement progress indicators for long operations

#### Rollback Point: Revert to Phase 2 state

---

### Phase 4: Advanced Features (Week 9-10)
**Goal**: CodeLens, auto-indexing, server lifecycle

#### Tasks:
- [ ] Implement CodeLens provider for "Plan changes here"
- [ ] Implement CodeLens provider for "Search related code"
- [ ] Add server auto-start on activation (configurable)
- [ ] Implement auto-index trigger logic
- [ ] Add server health monitoring
- [ ] Implement server restart command

#### Rollback Point: Revert to Phase 3 state

---

### Phase 5: Polish & Release (Week 11-12)
**Goal**: Documentation, testing, marketplace preparation

#### Tasks:
- [ ] Write comprehensive README for extension
- [ ] Create CHANGELOG
- [ ] Add extension icon and marketplace assets
- [ ] Run full integration test suite
- [ ] Publish to VS Code Marketplace (preview)
- [ ] Gather user feedback

---

## 4. Testing Strategy

### 4.1 Testing Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    Testing Pyramid                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌─────────────────┐                          │
│                    │   E2E Tests     │  (VS Code + Server)      │
│                    └─────────────────┘                          │
│               ┌─────────────────────────┐                       │
│               │   Integration Tests     │  (HTTP API)           │
│               └─────────────────────────┘                       │
│          ┌────────────────────────────────────┐                 │
│          │         Unit Tests                  │                │
│          │   (Extension + HTTP + Services)    │                 │
│          └────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Test Categories

| Category | Location | Framework | Purpose |
|----------|----------|-----------|---------|
| Server Unit | `tests/` | Jest | Existing tool tests |
| HTTP Unit | `tests/http/` | Jest | New HTTP layer tests |
| Extension Unit | `vscode-extension/test/` | Mocha | Extension logic tests |
| Integration | `tests/integration/` | Jest | HTTP API + Service tests |
| E2E | `e2e/` | VS Code Test Runner | Full workflow tests |

### 4.3 Test Isolation

```typescript
// tests/http/httpServer.test.ts
describe('HTTP Server', () => {
  let httpServer: HttpServer;
  let mockServiceClient: MockContextServiceClient;

  beforeEach(() => {
    // Use mock service client - no real indexing
    mockServiceClient = new MockContextServiceClient();
    httpServer = new HttpServer(mockServiceClient);
  });

  it('should not affect stdio transport', async () => {
    // Verify stdio server still works independently
  });
});
```

### 4.4 Backward Compatibility Tests

```typescript
// tests/compatibility/stdio.test.ts
describe('Backward Compatibility', () => {
  it('should handle existing stdio clients unchanged', async () => {
    // Spin up stdio server
    // Send existing tool calls
    // Verify responses match previous behavior
  });

  it('should not require HTTP for stdio clients', async () => {
    // Start server without --http flag
    // Verify stdio works
    // Verify no HTTP port is opened
  });
});
```




---

## 5. Backward Compatibility

### 5.1 Compatibility Matrix

| Client | Transport | Change Required | Status |
|--------|-----------|-----------------|--------|
| Codex CLI | stdio | None | ✅ Unchanged |
| Claude Desktop | stdio | None | ✅ Unchanged |
| Antigravity | stdio | None | ✅ Unchanged |
| VS Code Extension | HTTP | New | ➕ New client |
| Future HTTP Clients | HTTP | New | ➕ New client |

### 5.2 MCP Contract Preservation

```typescript
// These tool signatures MUST NOT change
interface MCPToolContract {
  // Preserved exactly as-is
  index_status(): IndexStatusResponse;
  index_workspace(args: { force?: boolean }): IndexResult;
  semantic_search(args: { query: string; top_k?: number }): SearchResults;
  codebase_retrieval(args: { query: string; top_k?: number }): RetrievalResults;
  enhance_prompt(args: { prompt: string }): EnhancedPrompt;
  planning(args: { prompt: string }): Plan;
}
```

### 5.3 HTTP API Versioning

```
/api/v1/...  ← Current version
/api/v2/...  ← Future breaking changes (if needed)
```

### 5.4 Configuration Compatibility

```jsonc
// Existing config formats remain valid

// Codex CLI (.codex/config.toml) - UNCHANGED
[mcp.context_engine]
type = "stdio"
command = "node"
args = ["dist/index.js", "--workspace", "."]

// Claude Desktop (mcp.json) - UNCHANGED
{
  "servers": {
    "context-engine": {
      "command": "node",
      "args": ["dist/index.js", "--workspace", "."]
    }
  }
}

// NEW: HTTP mode (optional)
// Only used when --http flag is passed
node dist/index.js --workspace . --http --port 3333
```

---

## 6. Deployment Strategy

### 6.1 Feature Flags

```typescript
// src/config/featureFlags.ts
export const FeatureFlags = {
  HTTP_SERVER_ENABLED: process.argv.includes('--http'),
  HTTP_PORT: parseInt(process.argv.find((_, i, arr) =>
    arr[i-1] === '--port')?.toString() || '3333'),
  AUTO_INDEX_ON_HTTP: process.env.CONTEXT_ENGINE_AUTO_INDEX === 'true',
};
```

### 6.2 Gradual Rollout

| Stage | Scope | Duration | Criteria to Advance |
|-------|-------|----------|---------------------|
| Alpha | Internal testing | 1 week | All tests pass, no regressions |
| Beta | 10 selected users | 2 weeks | <1% error rate, positive feedback |
| GA | Public release | Ongoing | Stable for 1 week in beta |

### 6.3 Release Channels

```
┌─────────────────────────────────────────────────────────────────┐
│                    Release Channels                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  npm publish --tag alpha    → context-engine@1.7.0-alpha.1      │
│  npm publish --tag beta     → context-engine@1.7.0-beta.1       │
│  npm publish                → context-engine@1.7.0              │
│                                                                  │
│  VS Code Marketplace:                                           │
│  - Pre-release channel for beta testing                         │
│  - Stable channel for GA                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 Monitoring

```typescript
// Metrics to track
interface DeploymentMetrics {
  httpRequestsTotal: Counter;
  httpRequestDuration: Histogram;
  httpErrors: Counter;
  stdioRequestsTotal: Counter;  // Verify unchanged
  indexOperations: Counter;
  activeConnections: Gauge;
}
```

---

## 7. Validation Criteria

### 7.1 Phase Acceptance Criteria

#### Phase 0 ✓ Complete When:
- [ ] Extension scaffolding builds without errors
- [ ] CI pipeline runs successfully
- [ ] Development environment documented

#### Phase 1 ✓ Complete When:
- [ ] HTTP server starts on specified port
- [ ] All 6 API endpoints respond correctly
- [ ] stdio transport still works (backward compat test passes)
- [ ] No modifications to existing `src/mcp/*.ts` files
- [ ] 90%+ test coverage on new HTTP code

#### Phase 2 ✓ Complete When:
- [ ] Extension installs in VS Code without errors
- [ ] Extension connects to running HTTP server
- [ ] Index status displays correctly
- [ ] Settings work (serverUrl, autoStart)

#### Phase 3 ✓ Complete When:
- [ ] All sidebar actions functional
- [ ] Toolbar icons trigger correct commands
- [ ] Search results display in output channel
- [ ] Progress indicators show for long operations

#### Phase 4 ✓ Complete When:
- [ ] CodeLens appears near code sections
- [ ] Auto-indexing triggers appropriately
- [ ] Server lifecycle management works
- [ ] Memory usage stable over 24h test

#### Phase 5 ✓ Complete When:
- [ ] README complete with screenshots
- [ ] All tests passing (unit, integration, E2E)
- [ ] Marketplace listing approved
- [ ] No critical bugs in 1-week beta period

### 7.2 Performance Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| HTTP cold start | <500ms | Time from request to first response |
| Search latency | <2s for 10 results | End-to-end search time |
| Memory usage | <200MB baseline | After 1 hour idle |
| Extension activation | <1s | VS Code devtools measurement |

### 7.3 Quality Gates

```yaml
# .github/workflows/quality-gates.yml
quality_gates:
  - name: "Backward Compatibility"
    script: npm run test:compat
    required: true

  - name: "No Core Modifications"
    script: |
      git diff --name-only HEAD~1 | grep -v "^src/http/" |
      grep -v "^vscode-extension/" | grep "^src/" && exit 1 || exit 0
    required: true

  - name: "Test Coverage"
    script: npm run test:coverage -- --coverageThreshold='{"global":{"branches":80}}'
    required: true
```

---

## 8. Rollback Plan

### 8.1 Rollback Levels

```
┌─────────────────────────────────────────────────────────────────┐
│                    Rollback Severity Levels                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Level 1: Extension Only                                        │
│  └── Uninstall VS Code extension                                │
│  └── Server continues unchanged                                 │
│                                                                  │
│  Level 2: HTTP Server                                           │
│  └── Remove --http flag from startup                            │
│  └── stdio clients unaffected                                   │
│                                                                  │
│  Level 3: Full Rollback                                         │
│  └── npm install context-engine@1.6.0 (previous version)       │
│  └── git checkout v1.6.0                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Rollback Triggers

| Issue | Severity | Automatic Rollback | Manual Rollback |
|-------|----------|-------------------|-----------------|
| stdio transport fails | Critical | N/A (deploy blocked) | Immediate |
| HTTP 500 error rate >5% | High | After 5 min | Immediate |
| Memory leak detected | Medium | After 1 hour | Within 24h |
| Extension crash on load | Medium | N/A | Uninstall extension |
| Search returns wrong results | Low | N/A | Investigate first |

### 8.3 Rollback Procedures

#### Procedure A: Extension Rollback
```bash
# VS Code Command Palette
> Extensions: Uninstall Extension
> Select "Context Engine"
> Restart VS Code
```

#### Procedure B: HTTP Server Rollback
```bash
# Stop server with HTTP
pkill -f "context-engine.*--http"

# Restart without HTTP (stdio only)
node dist/index.js --workspace /path/to/project
```

#### Procedure C: Full Server Rollback
```bash
# Install previous version
npm install context-engine-mcp-server@1.6.0

# Or from git
git checkout v1.6.0
npm install
npm run build
```

### 8.4 Rollback Verification

```bash
# After any rollback, verify:

# 1. stdio still works
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js --workspace .

# 2. Codex can connect
codex mcp list

# 3. No regressions
npm test
```

---

## 9. Dependency Management

### 9.1 Server Dependencies (New)

```bash
# Add HTTP server dependencies (if not already present)
npm install express@^5.0.0 cors@^2.8.5

# Development dependencies for HTTP testing
npm install -D supertest@^6.3.0 @types/supertest@^2.0.16
```

### 9.2 Extension Dependencies

```bash
# In vscode-extension/ directory
npm install
# Uses VS Code's built-in HTTP capabilities (no external deps needed)
```

### 9.3 Dependency Isolation

```
┌──────────────────────────────────────────────────────────────┐
│              context-engine (server)                          │
│  package.json - express, cors, @modelcontextprotocol/sdk    │
└──────────────────────────────────────────────────────────────┘
                           ↑
                    HTTP requests only
                           ↑
┌──────────────────────────────────────────────────────────────┐
│             vscode-extension (client)                         │
│  package.json - @types/vscode (no runtime deps needed)       │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. File Change Summary

### 10.1 Files to CREATE (Safe - No Risk)

| File | Purpose |
|------|---------|
| `src/http/httpServer.ts` | HTTP server implementation |
| `src/http/routes/*.ts` | API route handlers |
| `src/http/middleware/*.ts` | Express middleware |
| `tests/http/*.test.ts` | HTTP layer tests |
| `tests/compatibility/*.test.ts` | Backward compat tests |
| `vscode-extension/**` | Entire extension directory |

### 10.2 Files to MODIFY (Minimal Risk)

| File | Change | Risk Level |
|------|--------|------------|
| `src/index.ts` | Add `--http`, `--port` flags | Low |
| `package.json` | Add express dependency | Low |
| `tsconfig.json` | Include `src/http/**` | Negligible |

### 10.3 Files NOT TO MODIFY (Protected)

| File | Reason |
|------|--------|
| `src/mcp/server.ts` | Core stdio transport |
| `src/mcp/serviceClient.ts` | Core service layer |
| `src/mcp/tools/*.ts` | Tool implementations |
| Existing test files | May break existing tests |

---

## Appendix A: Quick Reference

### Start HTTP Server
```bash
node dist/index.js --workspace /path/to/project --http --port 3333
```

### Test HTTP Endpoints
```bash
curl http://localhost:3333/health
curl http://localhost:3333/api/v1/status
curl -X POST http://localhost:3333/api/v1/search -H "Content-Type: application/json" -d '{"query": "authentication"}'
```

### Run Tests
```bash
npm test                    # All tests
npm run test:http          # HTTP layer only
npm run test:compat        # Backward compatibility only
cd vscode-extension && npm test  # Extension tests
```

---

## Appendix B: Checklist Summary

- [ ] **Phase 0**: Environment setup complete
- [ ] **Phase 1**: HTTP server works, stdio unchanged
- [ ] **Phase 2**: Extension connects to server
- [ ] **Phase 3**: UI features implemented
- [ ] **Phase 4**: Advanced features complete
- [ ] **Phase 5**: Published to marketplace
- [ ] **Compatibility**: All existing clients work unchanged
- [ ] **Tests**: 90%+ coverage, all passing
- [ ] **Rollback**: Procedures documented and tested
