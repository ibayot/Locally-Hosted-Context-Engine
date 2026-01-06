# Installation Guide - Local Context Engine v1.0.0

This guide will help you set up the Local Context Engine on your machine. Once installed, you can use it across unlimited projects.

## Prerequisites
*   **Node.js**: Version 18 or higher.
*   **Git**: To clone the repository.
*   **IDE**: Cursor, Windsurf, or any IDE that supports the Model Context Protocol (MCP).

## Step 1: Build the Engine

1.  **Navigate to the project directory**:
    ```bash
    cd context-engine
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Build the project**:
    ```bash
    npm run build
    ```
    *This will create a `dist/` directory with the compiled server.*

## Step 2: Configure Your IDE

### For Cursor / Windsurf

1.  Locate your MCP configuration file (usually found in `%AppData%\Cursor\User\globalStorage\mcp.json` or similar, depending on your OS/Editor).
2.  Add the `context-engine` server to your configuration:

    ```json
    {
      "mcpServers": {
        "context-engine": {
          "command": "node",
          "args": [
            "C:/path/to/your/local-context-engine/dist/index.js",
            "${workspaceFolder}"
          ],
          "env": {
             "NODE_ENV": "production"
          }
        }
      }
    }
    ```
    > **Important**: Replace `C:/path/to/your/local-context-engine/` with the actual absolute path where you built the project.

### Why `${workspaceFolder}`?
By passing `${workspaceFolder}` as an argument, the Context Engine dynamically indexes whatever folder you currently have open. This means you only need to configure it **once**, and it works for every project you open.

## Step 3: First Run Verification

1.  Open any folder in your IDE.
2.  Check the "Output" or "MCP" logs in your IDE.
3.  You should see logs indicating the server is starting.
4.  **First time only**: You might see a delay or network activity while it downloads the embedding models to `.local-context/models` inside your project folder.
5.  Once initialized, you can use `@codebase` or other context tools immediately.

## Troubleshooting

*   **Models not downloading?**: Ensure you have internet access for the very first run.
*   **"Planning requires LLM" error?**: This is expected behavior in v1.0.0 local mode. The planning and review tools are disabled as they require a generative text AI, which is stripped out for this purely local embedding engine.
