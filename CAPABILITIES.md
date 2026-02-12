# Context Engine Capabilities & Tools (v1.2.0)

The Context Engine provides 27 specialized tools to give your AI agent deep understanding of your codebase and workflow capabilities.

---

## 🧠 Core Context (6 Tools)
*Primary Interface for Understanding Code*

| Tool | Description | Best For |
|------|-------------|----------|
| **`get_context_for_prompt`** | Smart retrieval of relevant code + summaries + memory. | **ALWAYS start here.** Prepares context for any task. |
| **`codebase_retrieval`** | Semantic RAG search across the entire workspace. | "How does authentication work?" |
| **`semantic_search`** | Find code snippets by meaning/concept. | "Find error handling logic for API." |
| **`get_file`** | Read full file contents. | Deep reading of specific files. |
| **`tool_manifest`** | List all available tools. | dynamic discovery. |
| **`index_workspace`** | Force a re-index of the codebase. | Initial setup or after mass changes. |

## 🏗️ Analysis & Insight (8 Tools)
*AST-Powered Structural Understanding*

| Tool | Description | Best For |
|------|-------------|----------|
| **`find_symbol`** | Locate functions/classes/types by name. | "Where is `UserService` defined?" |
| **`dependency_graph`** | Map imports and exports for a file. | "What breaks if I change this file?" |
| **`code_metrics`** | Analyze complexity, lines of code, nesting. | Refactoring and quality checks. |
| **`project_structure`** | Tree view of folders and files. | Exploring a new codebase. |
| **`file_stats`** | Size, type, and counts of files. | Repository overview. |
| **`git_context`** | Read commits, diffs, and blame. | "Who changed this line and why?" |
| **`run_static_analysis`** | Run `tsc` and `semgrep` locally. | Detecting bugs before implementation. |
| **`scan_security`** | Detect secrets/API keys. | Safety checks. |

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

---

## 💡 How to Use Effective Context

### The "Golden Flow" for Agents
1. **Explore**: `project_structure` → `codebase_retrieval` ("How does X work?")
2. **Deepen**: `find_symbol` (definitions) → `get_file` (implementation details)
3. **Plan**: `scaffold_bmad` → `save_plan`
4. **Execute**: `start_step` → Make Changes → `run_static_analysis` → `complete_step`
