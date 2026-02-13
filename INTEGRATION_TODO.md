# Context Engine v1.3.0 - Integration Todo

## ⚠️ Current Status: Foundation Ready, Integration Needed

All infrastructure files are created, but they need to be wired into the existing codebase to actually work.

---

## 📋 Integration Checklist

### Phase 1: Replace Core Services (2-3 days)

#### 1. Integrate Pino Logger
**Files to modify:**
- [ ] `src/mcp/serviceClient.ts` - Replace all `console.error()` with `log.error()`
- [ ] `src/mcp/server.ts` - Replace all `console.error()` with `log.error()`
- [ ] `src/local/service.ts` - Add logging
- [ ] All tool handlers in `src/mcp/tools/*.ts`

**Search & replace:**
```bash
# Find all console.error calls
grep -r "console.error" src/

# Import logger at top of each file:
import { log } from '../utils/logger.js';

# Replace:
console.error('message') → log.info('message')
console.error('Error:', err) → log.error('Error occurred', { error: String(err) })
```

#### 2. Integrate Zod Validation
**Files to modify:**
- [ ] `src/mcp/server.ts` - Update CallToolHandler to use schemas

**Before:**
```typescript
case 'semantic_search':
  result = await handleSemanticSearch(args as any, this.serviceClient);
  break;
```

**After:**
```typescript
import { SemanticSearchSchema } from './schemas.js';

case 'semantic_search':
  const validated = SemanticSearchSchema.parse(args); // Throws on invalid
  result = await handleSemanticSearch(validated, this.serviceClient);
  break;
```

Apply to all 27 tool cases.

#### 3. Integrate SQLite Vector Store
**Files to modify:**
- [ ] `src/mcp/serviceClient.ts` - Replace `LocalVectorStore` with `SQLiteVectorStore`

**Steps:**
1. Add feature flag check:
```typescript
import { featureEnabled } from '../config/features.js';
import { SQLiteVectorStore } from '../local/sqliteStore.js';
import { LocalVectorStore } from '../local/store.js'; // fallback

// In doInitialize():
if (featureEnabled('use_sqlite_storage') && featureEnabled('use_hnsw_index')) {
  this.vectorStore = new SQLiteVectorStore(this.workspacePath);
} else {
  this.vectorStore = new LocalVectorStore(); // existing
}
```

2. Update all vector store calls to use common interface
3. Add migration logic for existing JSON indexes

#### 4. Integrate Hierarchical Chunker
**Files to modify:**
- [ ] `src/local/sqliteStore.ts` - Use `HierarchicalChunker` instead of basic chunking

```typescript
import { HierarchicalChunker } from './hierarchicalChunker.js';

const chunker = featureEnabled('use_hierarchical_chunks') 
  ? new HierarchicalChunker()
  : null; // fallback to existing logic

// In addFile():
const chunks = chunker 
  ? chunker.createChunks(content, filePath)
  : this.createChunksBasic(content); // existing method
```

#### 5. Integrate Worker Thread Embedding
**Files to modify:**
- [ ] `src/local/embedding.ts` - Add worker pool option
- [ ] `src/local/service.ts` - Use worker pool

```typescript
import { EmbeddingWorkerPool } from '../workers/embeddingPool.js';
import { featureEnabled } from '../config/features.js';

// In LocalEmbeddingService:
private workerPool: EmbeddingWorkerPool | null = null;

async embed(text: string): Promise<number[]> {
  if (featureEnabled('use_worker_threads')) {
    if (!this.workerPool) {
      this.workerPool = new EmbeddingWorkerPool(this.modelName, this.cacheDir);
    }
    return await this.workerPool.embed(text);
  } else {
    // Existing single-threaded logic
    return await this.embedSingleThreaded(text);
  }
}
```

#### 6. Integrate Knowledge Graph
**Files to modify:**
- [ ] `src/mcp/serviceClient.ts` - Add knowledge graph field and update methods

```typescript
import { KnowledgeGraph } from '../local/knowledgeGraph.js';

// Add field:
private knowledgeGraph: KnowledgeGraph | null = null;

// In doInitialize():
if (featureEnabled('enable_knowledge_graph')) {
  this.knowledgeGraph = new KnowledgeGraph(this.workspacePath);
}

// In indexFiles() - after adding to vector store:
if (this.knowledgeGraph && featureEnabled('enable_knowledge_graph')) {
  await this.knowledgeGraph.addFile(filePath, content);
}

// In getContextForPrompt() - expand with related files:
if (this.knowledgeGraph && featureEnabled('dependency_aware_context')) {
  const relatedFiles = this.knowledgeGraph.getRelatedFiles(filePath, 2);
  // Include relatedFiles in context bundle
}
```

#### 7. Integrate GitHub Tools
**Files to modify:**
- [ ] `src/mcp/server.ts` - Add GitHub tools to registry

```typescript
import { githubTools, handleGetGitHubIssues, ... } from './tools/github.js';
import { featureEnabled } from '../config/features.js';

// In setupHandlers(), add to toolsList:
if (featureEnabled('enable_github_integration')) {
  toolsList.push(...githubTools);
}

// In CallToolHandler, add cases:
case 'get_github_issues':
  if (featureEnabled('enable_github_integration')) {
    result = await handleGetGitHubIssues(
      GetGitHubIssuesSchema.parse(args),
      this.workspacePath
    );
  }
  break;
// ... other GitHub tools
```

---

### Phase 2: Fix Critical Bugs (30 mins)

#### Fix doInitialize() Bug
**File:** `src/mcp/serviceClient.ts`

**Location:** Lines 1110-1135

**Current (buggy):**
```typescript
if (fs.existsSync(stateFilePath)) {
  console.error(`Restoring context from ${stateFilePath}`);
  // BUG: Returns without creating this.context!
  return;
}
```

**Fixed:**
```typescript
if (fs.existsSync(stateFilePath)) {
  log.info(`Restoring context from ${stateFilePath}`);
  this.context = await LocalContextService.create(this.workspacePath);
  this.restoredFromStateFile = true;
  log.info('Context restored successfully');
  // ... update status
  return;
}
```

---

### Phase 3: Testing (1 day)

#### Unit Tests
- [ ] Test SQLite store independently
- [ ] Test HNSW index
- [ ] Test hierarchical chunker
- [ ] Test knowledge graph
- [ ] Test worker pool

#### Integration Tests
- [ ] Index a medium codebase (~1000 files)
- [ ] Verify search speed improvement
- [ ] Test migration from v1.2 JSON to v1.3 SQLite
- [ ] Test knowledge graph queries
- [ ] Test GitHub integration (if enabled)

#### Performance Tests
- [ ] Benchmark search latency (should be <10ms for 10K chunks)
- [ ] Benchmark indexing speed (should be 4-8x faster with workers)
- [ ] Memory usage (should be ~50% less)
- [ ] Disk usage (should be ~80% less)

---

### Phase 4: Migration & Deployment (1 day)

#### Migration Script
Create `scripts/migrate-v1.2-to-v1.3.ts`:
```typescript
// 1. Detect old .augment-context-state.json
// 2. Load JSON chunks
// 3. Convert to SQLite format
// 4. Build HNSW index
// 5. Build knowledge graph
// 6. Backup old files
// 7. Save new format
```

#### Deployment Checklist
- [ ] Update README with v1.3 features
- [ ] Update CAPABILITIES.md with new tools
- [ ] Add migration guide
- [ ] Test clean install (no existing state)
- [ ] Test upgrade path (v1.2 → v1.3)
- [ ] Document rollback procedure

---

## 🚀 Quick Start Integration (Minimal Viable)

If you want to get v1.3 working QUICKLY with minimal changes:

### Day 1: Core Performance Upgrade
1. Integrate SQLite store (biggest impact)
2. Integrate Zod validation (safety)
3. Fix doInitialize() bug (critical)

### Day 2: Advanced Features
4. Integrate knowledge graph
5. Integrate hierarchical chunker
6. Integrate worker threads

### Day 3: Polish
7. Replace console.error with logger
8. Add GitHub tools (optional)
9. Test & deploy

---

## 📝 Estimated Effort

| Task | Time | Priority |
|------|------|----------|
| Pino logging integration | 2 hours | Medium |
| Zod validation integration | 3 hours | High |
| SQLite store integration | 4 hours | **Critical** |
| Hierarchical chunker | 2 hours | High |
| Worker threads | 3 hours | High |
| Knowledge graph | 4 hours | High |
| GitHub tools | 1 hour | Low |
| Bug fixes | 1 hour | **Critical** |
| Testing | 8 hours | High |
| Migration script | 4 hours | Medium |
| **TOTAL** | **32 hours** (~4 days) | |

---

## ⚠️ Risks & Challenges

1. **SQLite Compilation** - `better-sqlite3` requires native compilation
   - Windows may need build tools
   - May fail on some systems
   - Fallback: Keep JSON store as option

2. **Worker Threads** - Can fail due to module loading issues
   - Must use proper ESM worker path
   - May need conditional fallback
   - Fallback: Single-threaded embedding

3. **Breaking Changes** - v1.3 uses different storage format
   - Migration is one-way (can't downgrade)
   - Must backup old state
   - Provide rollback instructions

4. **Performance Regression** - If integration is buggy, could be SLOWER
   - Need robust fallbacks
   - Feature flags to disable new code
   - Gradual rollout recommended

---

## 🎯 Success Criteria

v1.3 is "done" when:

✅ All dependencies install without errors
✅ SQLite store works and is faster than JSON
✅ HNSW search is <50ms for 10K chunks
✅ Knowledge graph correctly tracks dependencies
✅ Worker threads index 2x+ faster (or fallback works)
✅ Existing v1.2 indexes can migrate without data loss
✅ All existing tests pass
✅ At least one manual end-to-end test succeeds

---

## 📞 Support

If you encounter issues during integration:

1. Check feature flags in `.env`
2. Try disabling new features one by one
3. Check logs for errors (`LOG_LEVEL=debug`)
4. Verify dependencies installed correctly (`npm list`)
5. Test components independently before integration

---

**Next Step:** Start with SQLite integration - it has the biggest performance impact and is the foundation for other features.
