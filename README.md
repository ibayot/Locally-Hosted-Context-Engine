# Context Engine (Local Edition v3.0)

A powerful, **Local-First** context engine for AI Agents (Antigravity/Gemini).

## Features
*   **100% Local**: No API keys, no clouds, no recurring costs.
*   **Smart Indexing**: Respects function/class boundaries for accurate context.
*   **Fast Parallel Processing**: Up to 8x faster indexing.
*   **BMAD Integration**: Built-in support for the "Breakthrough Method for Agile AI-Driven Development".
*   **Security Scanning**: Integrated secret scanning to prevent leaks.

## Installation
```bash
npm install
npm run build
```

## Usage

### Start Server (MCP)
```bash
# Standard mode (stdio)
node dist/index.js

# With File Watcher (auto-reindex on changes)
node dist/index.js --watch

# Force initial indexing
node dist/index.js --index
```

## Tools Available
The server exposes the following tools to your AI agent:

### 🔍 Context Retrieval
*   `index_workspace`: Index the current project.
*   `semantic_search(query)`: Search for code by meaning.
*   `get_context_for_prompt(prompt)`: Smartly retrieve context for a task.

### 📘 BMAD Method
*   `get_bmad_guidelines(phase)`: Get instructions for Planning, Architecture, or Development phases.

### 🛡️ Security
*   `scan_security(path)`: Scan files for API keys and dangerous patterns.

## Architecture
*   **Embeddings**: `@xenova/transformers` (all-MiniLM-L6-v2) - Local CPU execution.
*   **Storage**: JSON-based Vector Store (`.local-context/index.json`).
*   **Protocol**: Model Context Protocol (MCP) over Stdio.
