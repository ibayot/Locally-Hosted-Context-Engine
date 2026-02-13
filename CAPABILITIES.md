# Context Engine Capabilities & Tools (v1.3.0)

The Context Engine provides **27-31 specialized tools** to give your AI agent deep understanding of your codebase with **enhanced performance** via SQLite vector search, knowledge graphs, and hierarchical chunking.

---

## 🆕 What's New in v1.3.0

### **Performance Enhancements**
- ✅ **SQLite + HNSW Vector Store**: 100x faster search (10ms vs 500ms for 10K chunks)
- ✅ **Hierarchical Chunking**: Multi-level indexing (file → class → function → blocks)
- ✅ **Worker Thread Embedding**: 4-8x faster indexing via parallel processing
- ✅ **Knowledge Graph**: Import/export/call relationship tracking for dependency-aware context

### **New Tools** (Optional - GitHub Integration)
- 🆕 **`get_github_issues`** - Fetch repository issues with filtering
- 🆕 **`get_github_issue`** - Get detailed issue by number
- 🆕 **`search_github_issues`** - Search issues using GitHub query syntax
- 🆕 **`get_github_prs`** - List pull requests with state filtering

Requires: `CE_GITHUB_INTEGRATION=true` and optional `GITHUB_TOKEN` env var.

---

## 🧠 Core Context (6 Tools)
*Primary Interface for Understanding Code*

| Tool | Description | Best For | v1.3 Enhancement |
|------|-------------|----------|------------------|
| **`get_context_for_prompt`** | Smart retrieval of relevant code + summaries + memory. | **ALWAYS start here.** Prepares context for any task. | 🚀 Knowledge graph adds related files |
| **`codebase_retrieval`** | Semantic RAG search across the entire workspace. | "How does authentication work?" | 🚀 HNSW index = 50x faster |
| **`semantic_search`** | Find code snippets by meaning/concept. | "Find error handling logic for API." | 🚀 Hierarchical chunks improve precision |
| **`get_file`** | Read full file contents. | Deep reading of specific files. | - |
| **`tool_manifest`** | List all available tools. | Dynamic discovery. | - |
| **`index_workspace`** | Force a re-index of the codebase. | Initial setup or after mass changes. | 🚀 Worker threads = 4-8x faster |

## 🏗️ Analysis & Insight (8 Tools)
*AST-Powered Structural Understanding*

| Tool | Description | Best For | v1.3 Enhancement |
|------|-------------|----------|------------------|
| **`find_symbol`** | Locate functions/classes/types by name. | "Where is `UserService` defined?" | 🚀 Symbol-level chunks prioritized |
| **`dependency_graph`** | Map imports and exports for a file. | "What breaks if I change this file?" | 🚀 Knowledge graph integration |
| **`code_metrics`** | Analyze complexity, lines of code, nesting. | Refactoring and quality checks. | - |
| **`project_structure`** | Tree view of folders and files. | Exploring a new codebase. | - |
| **`file_stats`** | Size, type, and counts of files. | Repository overview. | - |
| **`git_context`** | Read commits, diffs, and blame. | "Who changed this line and why?" | - |
| **`run_static_analysis`** | Run `tsc` and `semgrep` locally. | Detecting bugs before implementation. | - |
| **`scan_security`** | Detect secrets/API keys. | Safety checks. | - |

## 📅 Planning & Workflow (9 Tools)
*Agent-Driven Project Management*

| Tool | Description | Actions |
|------|-------------|---------|
| **`visualize_plan`** | Generate Mermaid diagrams of the plan. | See dependencies visually. |
| **Plan CRUD** | Manage implementation plans. | `save_plan`, `load_plan`, `list_plans`, `delete_plan` |
| **Step Management** | Track execution progress. | `start_step`, `complete_step` |
| **History** | Review plan changes. | `view_progress`, `view_history` |

## 🧠 Memory (2 Tools)
*Cross-Session Recall*

| Tool | Description |
|------|-------------|
| **`add_memory`** | Store facts, user preferences, or architectural decisions. |
| **`list_memories`** | Retrieve stored knowledge. |

## 🛡️ Reactive Review (5 Tools)
*Automated QA & Code Review*

| Tool | Description |
|------|-------------|
| **`reactive_review_pr`** | Compare changes against main branch. |
| **`scrub_secrets`** | Redact API keys from text. |
| **Session Control** | `get_review_status`, `pause_review`, `resume_review`, `get_review_telemetry` |

## 🤖 BMAD Workflow (2 Tools)
*Agent-Driven Development Framework*

| Tool | Description | Usage |
|------|-------------|-------|
| **`scaffold_bmad`** | Create `01_PRD`, `02_ARCH`, `03_TASKS` templates. | Start of every new feature. |
| **`get_bmad_guidelines`** | Retrieve role-specific instructions. | "How should a Product Owner act?" |

## 🔗 GitHub Integration (4 Tools - Optional)
*Issue and PR Management*

Requires: `CE_GITHUB_INTEGRATION=true` in `.env`.

| Tool | Description | Best For |
|------|-------------|----------|
| **`get_github_issues`** | Fetch issues with state filter (open/closed/all). | "Show me all open bugs." |
| **`get_github_issue`** | Get detailed issue by number. | "What's issue #42 about?" |
| **`search_github_issues`** | Search with GitHub query syntax. | "Find issues labeled 'enhancement'." |
| **`get_github_prs`** | List pull requests with state filtering. | "Show me closed PRs from this week." |

**Setup**: 
1. Ensure workspace has a GitHub remote: `git remote -v`
2. (Optional but recommended) Set `GITHUB_TOKEN` env var to raise rate limit from 60/hr to 5000/hr

---

## 💡 How to Use Effective Context

### The "Golden Flow" for Agents (Updated for v1.3)
1. **Explore**: `project_structure` → `codebase_retrieval` ("How does X work?")
   - 🆕 Knowledge graph automatically suggests related files
2. **Deepen**: `find_symbol` (definitions) → `get_file` (implementation details)
   - 🆕 Symbol-level chunks provide precise results
3. **Plan**: `scaffold_bmad` → `save_plan`
4. **Execute**: `start_step` → Make Changes → `run_static_analysis` → `complete_step`
5. **Review**: `reactive_review_pr` → `get_github_issues` (if integration enabled)
   - 🆕 Cross-reference code changes with related issues

### Performance Tips for v1.3
- **First-time indexing**: Expect 2-4 min for 1000 files (vs 8+ min in v1.2)
- **Search latency**: <10ms for 10K chunks (vs ~500ms in v1.2)
- **Worker threads**: Enable `CE_WORKER_THREADS=true` for 4-8x faster embedding
- **Knowledge graph**: Enable `CE_KNOWLEDGE_GRAPH=true` for dependency tracking

