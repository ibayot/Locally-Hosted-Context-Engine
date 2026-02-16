# Context Engine (v1.3.0)

> **The "Brain" for Your Local AI Agents - Now with SQLite Vector Search & Knowledge Graphs**

The Context Engine is a Model Context Protocol (MCP) server that gives your AI agents (Antigravity, Claude, etc.) deep understanding of your local codebase. It provides AST-powered analysis, semantic search, and structured workflow automation—**all running 100% locally**.

## 🌟 What's New in v1.3.0

### **Performance & Scalability Upgrades**
- ✅ **SQLite + HNSW Vector Store**: 100x faster search, 80% less disk usage vs JSON
- ✅ **Hierarchical Code Chunking**: Multi-level indexing (file → class → function → blocks)
- ✅ **Worker Thread Embedding**: 4-8x faster indexing via parallel processing
- ✅ **Knowledge Graph**: Tracks import/export/call relationships for dependency-aware context
- ✅ **Zod Runtime Validation**: Type-safe MCP tool arguments (replaces unsafe `as any`)
- ✅ **Structured Logging**: Pino-based JSON logs to stderr (no stdio corruption)

### **Optional GitHub Integration** (New)
- 🆕 `get_github_issues` - Fetch repository issues
- 🆕 `get_github_issue` - Get issue details by number
- 🆕 `search_github_issues` - Search issues with query
- 🆕 `get_github_prs` - List pull requests

Enable with: `CE_GITHUB_INTEGRATION=true` and set `GITHUB_TOKEN` env var.

## 🚀 Key Features

### 1. **High-Performance Vector Search**
- **SQLite Backend**: ACID-compliant storage with WAL mode
- **HNSW Index**: O(log n) similarity search for 10K+ chunks
- **Hierarchical Chunks**: Contextual retrieval at symbol/function/file levels

### 2. **Deep Local Analysis**
- **AST-Powered Search**: Instantly find symbol definitions (`find_symbol`)
- **Dependency Graph**: Visualize module relationships with import tracking
- **Semantic Search**: "RAG-in-a-box" powered by local embeddings
- **Knowledge Graph**: Related file discovery via dependency analysis

### 3. **Agent-Driven BMAD Workflow**
Implements the **Breakthrough Method for Agile AI-Driven Development**:
- **Scaffold**: `scaffold_bmad` generates project templates (`01_PRD.md`, `02_ARCH.md`, `03_TASKS.md`)
- **Plan**: Agents act as Product Owner & Architect
- **Execute**: Engine provides context to implement step-by-step

### 4. **Focused Toolset**
**27 core tools** (31 with GitHub integration):
- **Core Context**: `get_context_for_prompt`, `codebase_retrieval`, `semantic_search`
- **Planning**: `visualize_plan`, `save/load_plan`, `start/complete_step`
- **Analysis**: `run_static_analysis`, `scan_security`, `code_metrics`, `dependency_graph`
- **Memory**: `add_memory`, `list_memories` (cross-session recall)
- **GitHub** (optional): Issue and PR management

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/ibayot/local-context-engine.git
cd local-context-engine
npm install
npm run build
```

### 2. Migration from v1.2
If upgrading from v1.2:
```bash
npm run migrate
```
This converts your JSON index to SQLite format (backs up old data automatically).

### 3. Configuration (.env)
```bash
# v1.3 Feature Flags (recommended defaults)
CE_USE_SQLITE=true
CE_USE_HNSW=true
CE_HIERARCHICAL_CHUNKS=true
CE_WORKER_THREADS=true
CE_KNOWLEDGE_GRAPH=true
CE_DEPENDENCY_CONTEXT=true

# GitHub Integration (optional)
CE_GITHUB_INTEGRATION=false
GITHUB_TOKEN=your_token_here

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

### 4. Usage with Antigravity / MCP Clients

**Option A: Auto-Start (Recommended - Stdio)**
Add this to your agent's MCP config:
```json
{
  "mcpServers": {
    "context-engine": {
      "command": "node",
      "args": ["C:/path/to/context-engine/dist/index.js", "--index"],
      "env": {}
    }
  }
}
```

**Option B: Persistent Server (HTTP)**
```bash
npm run start:http  # Port 3334
```
Then configure your agent to connect to `http://localhost:3334/mcp`.

## 📊 Performance Benchmarks (v1.3 vs v1.2)

| Operation | v1.2 (JSON) | v1.3 (SQLite) | Improvement |
|-----------|-------------|---------------|-------------|
| Search 10K chunks | ~500ms | ~10ms | **50x faster** |
| Index 1000 files | ~8min | ~2min | **4x faster** |
| Disk usage (10K chunks) | 500MB | 100MB | **80% reduction** |
| Memory footprint | 1.5GB | 800MB | **50% less** |

## 📚 Documentation
- [Installation & Configuration](INSTALLATION.md)
- [Capabilities & Tools](CAPABILITIES.md)
- [Migration Guide](INTEGRATION_TODO.md)
- [Realistic Assessment](REALISTIC_ASSESSMENT.md)

## 🔧 Troubleshooting

**Windows: Native modules build errors?**
```
Error: gyp ERR! find VS could not find a version of Visual Studio
```
v1.3 includes optional native modules (better-sqlite3, hnswlib-node) for high performance. If you see build errors:
- **Option 1 (Recommended)**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  - Select "Desktop development with C++" workload
  - Restart terminal and run `npm install`
- **Option 2 (Fallback)**: Disable high-performance features:
  ```bash
  # In .env
  CE_USE_SQLITE=false
  CE_USE_HNSW=false
  ```
  Server will use JSON storage (still functional but slower on large codebases).

**Worker threads not starting?**
Set `CE_WORKER_THREADS=false` in `.env` to fallback to single-threaded embedding.

**Model download errors (`local_files_only=true` error)?**
```
Error: `local_files_only=true` and file was not found locally at tokenizer.json
```
This happens on first run when the embedding model needs to download. Fixed in latest version, but if you see it:
- Ensure you have internet connection on first server start
- The model (~100MB) downloads to `.local-context/models/` in your workspace
- Subsequent runs use the cached model
- If behind a proxy, set `HTTP_PROXY` and `HTTPS_PROXY` env vars

**GitHub tools not working?**
- Ensure workspace has a GitHub remote: `git remote -v`
- Set `GITHUB_TOKEN` env var (optional but raises rate limit from 60 to 5000/hr)

## 🤝 Contributing
Push changes to: `https://github.com/ibayot/local-context-engine.git`
