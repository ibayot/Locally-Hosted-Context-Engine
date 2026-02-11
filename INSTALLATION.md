# Context Engine v1.2.0 Installation Guide

The Context Engine is a powerful local analysis tool for your codebase, featuring AST-powered symbol search, dependency graphing, and agent-driven workflow scaffolding.

## Prerequisites

- **Node.js**: v18 or higher
- **Git**: Installed and available on PATH

## Installation

1. **Clone the repository** (if you haven't already) and navigate to the directory:
   ```bash
   cd context-engine
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## Configuration

The engine is designed to work out-of-the-box.

### 1. Code Analysis (Core)
The engine automatically indexes your workspace to provide:
- AST Analysis (`find_symbol`, `dependency_graph`, `code_metrics`)
- Local Utilities (`find_todos`, `project_structure`, `git_context`)
- Security Scanning (`scan_security`)

### 2. BMAD Workflow (Agent-Driven)
The engine supports the **BMAD** (Breakthrough Method for Agile AI-Driven Development) workflow by providing tools for your AI Agent (Claude, Gemini, etc.) to use.

- **Tool**: `scaffold_bmad`
- **Usage**: Your agent can call this tool to set up the `.bmad/` directory with `01_PRD.md`, `02_ARCH.md`, and `03_TASKS.md` templates.
- **Agent Role**: The agent then fills in these documents based on your goals, acting as the Product Owner, Architect, and Engineer.

> **Note:** Optional local LLM features (Ollama) are available in the codebase but **disabled by default** to minimize resource usage.

## verifying Installation

1. **Start the MCP Server** (usually handled by your agent/IDE):
   ```bash
   node build/index.js
   ```

2. **Check Status**:
   - Use the `index_status` tool to see indexing progress.
   - Use `tool_manifest` to see available capabilities.

## Troubleshooting

- **High RAM Usage**: 
  - Code analysis (AST/Vector Store) runs efficiently in background.
  - If you experience issues, the engine will automatically limit concurrency.
