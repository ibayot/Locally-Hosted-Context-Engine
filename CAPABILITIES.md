# Context Engine Capabilities (v1.2.0)

The **Context Engine** is a local-first MCP server designed to be the "brain" for your AI Agents. It provides deep codebase understanding, structured workflow automation, and persistent memory without relying on cloud services for analysis.

## Core Capabilities

### 1. 🧠 Context & RAG (Retrieval-Augmented Generation)
The engine maintains a semantic index of your codebase to answer natural language queries.
- **`get_context_for_prompt`** (Primary Tool): Retrieves highly relevant code snippets, file summaries, and related memories for a given query. Optimized for LLM context windows.
- **`semantic_search`**: Performs pure semantic search on the vector index.
- **`get_file`**: Reads full file contents with line-range support.

### 2. 🏗️ BMAD Workflow (Agent-Driven)
Implements the **Breakthrough Method for Agile AI-Driven Development**.
- **`scaffold_bmad`**: Generates a standard project structure (`.bmad/`) with templates for:
    - `01_PRD.md` (Product Requirements)
    - `02_ARCH.md` (Architecture)
    - `03_TASKS.md` (Sprint Plan)
  *Includes embedded instructions for the Agent to act as Product Owner, Architect, and Engineer.*
- **`get_bmad_guidelines`**: Provides role-specific guidelines (e.g., "What should the QA Engineer check?").

### 3. 🔍 Deep Code Analysis (AST-Powered)
Uses Abstract Syntax Trees to understand code structure, not just text.
- **`find_symbol`**: Locates functions, classes, and definitions by name.
- **`dependency_graph`**: Analyzes imports/exports to show how modules relate.
- **`code_metrics`**: Calculates complexity, LOC, and other stats for files.
- **`find_duplicates`**: Detects copy-pasted code blocks to reduce technical debt.

### 4. 🛡️ Security & Quality
- **`scan_security`**: Scans for secrets (API keys, tokens) and common vulnerabilities.
- **`find_todos`**: Aggregates `TODO`, `FIXME`, and `HACK` comments.
- **`validate_content`**: Checks code chunks for syntax errors (JSON/JS) before files are written.

### 5. 💾 Long-Term Memory
Allows the agent to learn from user preferences and past decisions.
- **`add_memory`**: Stores facts, preferences, or decisions that persist across sessions.
- **`list_memories`**: Retrieves stored memories.
*Memories are automatically injected into `get_context_for_prompt` when relevant.*

### 6. 🛠️ Local Utilities
- **`project_structure`**: Generates a tree view of the file system.
- **`file_statistics`**: Provides metadata (size, created/modified times).
- **`git_context`**: Analyzes git history and diffs (requires `git`).

---

## Architecture
- **Local Vector Store**: Uses a file-based vector index (in `.augment/` or `.context-engine/`) for fast retrieval.
- **TypeScript/Node.js**: Built for performance and extensibility.
- **MCP Standard**: Fully compatible with the [Model Context Protocol](https://modelcontextprotocol.io).
