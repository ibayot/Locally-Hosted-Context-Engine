#!/usr/bin/env node

/**
 * Context Engine MCP Server (Local Edition)
 * 
 * A pure-local MCP server for semantic search and context retrieval.
 */

import { ContextEngineMCPServer } from './mcp/server.js';
import * as path from 'path';

async function main() {
  // Get workspace path from command line args or use current directory
  const args = process.argv.slice(2);
  let workspacePath = process.cwd();
  let shouldIndex = false;
  let enableWatcher = false;
  let transport: 'stdio' | 'http' = (process.env.TRANSPORT_TYPE as 'stdio' | 'http') || 'stdio';
  let port: number = parseInt(process.env.MCP_PORT || '3334');

  // Simple argument parsing
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--workspace' || arg === '-w') {
      workspacePath = path.resolve(args[i + 1]);
      i++;
    } else if (arg === '--index' || arg === '-i') {
      shouldIndex = true;
    } else if (arg === '--watch' || arg === '-W') {
      enableWatcher = true;
    } else if (arg === '--transport' || arg === '-t') {
      transport = args[i + 1] as 'stdio' | 'http';
      i++;
    } else if (arg === '--port' || arg === '-p') {
      port = parseInt(args[i + 1]);
      i++;
    }
  }

  console.error('='.repeat(80));
  console.error('Context Engine MCP Server (Local)');
  console.error('='.repeat(80));
  console.error(`Workspace: ${workspacePath}`);
  console.error(`Transport: ${transport}`);
  console.error('');

  try {
    const server = new ContextEngineMCPServer(workspacePath, 'context-engine', {
      enableWatcher,
    });

    // Auto-Index if requested (Run in background to allow server to start immediately)
    if (shouldIndex) {
      console.error('Indexing workspace in background...');
      // Do not await - let it run in background so server can start
      server.indexWorkspace()
        .then(() => console.error('Background indexing complete!'))
        .catch(err => console.error('Background indexing failed:', err));
    }

    console.error(`Starting MCP server (${transport})...`);
    await server.run({ transport, port });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
