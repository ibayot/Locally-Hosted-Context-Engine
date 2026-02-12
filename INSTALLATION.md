# Context Engine v1.2.0 Installation & Configuration

The Context Engine works with any MCP-compliant client (Antigravity, Claude Desktop, customized agents).

## Prerequisites

- **Node.js**: v18 or higher (LTS recommended)
- **Git**: Installed and available on PATH

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ibayot/local-context-engine.git
   cd local-context-engine
   ```

2. **Install & Build**:
   ```bash
   npm install
   npm run build
   ```

---

## Configuration Options

Choose the valid transport mode that fits your workflow.

### Option A: Standard Integration (Stdio) - **Recommended**

Best for: **Antigravity**, **Claude Desktop**, single-project use.
The server starts automatically when you open your agent.

**Add to your MCP Configuration (`mcp_config.json` or similar):**

```json
{
  "mcpServers": {
    "context-engine": {
      "command": "node",
      "args": [
        "C:/path/to/local-context-engine/dist/index.js",
        "--index" 
      ],
      "env": {}
    }
  }
}
```

> **Note**: Do not set `--workspace`. By omitting it, the engine automatically indexes the folder you have open in your IDE.

### Option B: Persistent Background Server (HTTP)

Best for: **Multi-project setups**, troubleshooting connection issues, or if you prefer a "always-on" service.

1. **Start the Server**:
   ```bash
   # Starts on port 3334 by default
   npm run start:http
   
   # Or specify a custom port
   npm run start:http -- --port 4000
   ```

2. **Configure Your Client**:
   Point your MCP client (Antigravity/Claude) to: `http://localhost:3334/mcp` (SSE Endpoint).

---

## Troubleshooting

### "Stdio Blocking" / Agent Can't Message
**Symptoms**: The agent freezes or can't send messages while the MCP server is running.
**Fix**:
1. Ensure you are using v1.2.0 (check `package.json`).
2. Verify you are NOT using `console.log` in your own customizations (use `console.error` only).
3. Switch to **Option B (HTTP Transport)** as a fallback.

### "Indexing Failed"
**Symptoms**: `index_status` shows error or stuck state.
**Fix**:
1. Run the `reindex_workspace` tool.
2. Check `error.log` if available.
3. Ensure no massive binary files (videos, dlls) are in your source folders. Add them to `.contextignore`.

### High RAM Usage
The vector store and AST analysis run in-memory for speed. Large monorepos (>50k LOC) may usage 1-2GB RAM.
**Fix**:
- Add `node_modules`, `dist`, `build` to `.contextignore`.
