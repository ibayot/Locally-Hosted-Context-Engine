# Context Engine (v1.2.0)

> **The "Brain" for Your Local AI Agents**

The Context Engine is a Model Context Protocol (MCP) server that gives your AI agents (Antigravity, Claude, etc.) deep understanding of your local codebase. It provides AST-powered analysis, semantic search, and structured workflow automation—**all running 100% locally**.

## 🌟 Key Features

### 1. **Dual Transport Support (New in v1.2.0)**
- **Stdio (Default)**: Optimized for direct integration. Non-blocking architecture ensures your agent's messaging stays fast.
- **StreamableHTTP**: Run a persistent background server (multi-project support) or use if stdio has conflicts.

### 2. **Deep Local Analysis**
- **AST-Powered Search**: Instantly find symbol definitions (`find_symbol`) and usage.
- **Dependency Graph**: Visualize module relationships (`dependency_graph`).
- **Semantic Search**: "RAG-in-a-box" to find relevant code by concept, not just keyword.

### 3. **Agent-Driven BMAD Workflow**
Implements the **Breakthrough Method for Agile AI-Driven Development**:
- **Scaffold**: Agents use `scaffold_bmad` to generate project templates (`01_PRD.md`, `02_ARCH.md`, `03_TASKS.md`).
- **Plan**: Agents act as Product Owner & Architect to fill these plans.
- **Execute**: The engine provides the context to implement the plan step-by-step.

### 4. **Focused Toolset**
Pruned from 39 to **27 high-impact tools**, removing redundancy and focusing on:
- **Core Context**: `get_context_for_prompt`, `codebase_retrieval`
- **Planning**: `visualize_plan`, `start/complete_step`
- **Analysis**: `run_static_analysis`, `scan_security`, `code_metrics`
- **Memory**: `add_memory`, `list_memories` (Cross-session recall)

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/ibayot/local-context-engine.git
cd local-context-engine
npm install
npm run build
```

### 2. Usage with Antigravity / MCP Clients

**Option A: Auto-Start (Recommended - Stdio)**
Add this to your agent's MCP config. It automatically indexes whichever project you open.
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
Start the server once for background availability:
```bash
# Starts HTTP server on port 3334
npm run start:http
```
Then configure your agent to connect to `http://localhost:3334/mcp`.

## 📚 Documentation
- [Installation & Configuration](INSTALLATION.md)
- [Capabilities & Tools](CAPABILITIES.md)

## 🤝 Contributing
Push changes to: `https://github.com/ibayot/local-context-engine.git`
