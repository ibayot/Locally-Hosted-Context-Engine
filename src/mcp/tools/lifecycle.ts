/**
 * Layer 3: MCP Interface Layer - Lifecycle Tools
 *
 * Provides workspace lifecycle operations: reindex and clear index.
 */

import { ContextServiceClient } from '../serviceClient.js';

export interface ReindexWorkspaceArgs {
  // Optional future flags can be added here
}

export interface ClearIndexArgs {
  // No parameters needed
}

export async function handleReindexWorkspace(
  _args: ReindexWorkspaceArgs,
  serviceClient: ContextServiceClient
): Promise<string> {
  const startTime = Date.now();

  await serviceClient.clearIndex();
  const result = await serviceClient.indexWorkspace();

  const elapsed = Date.now() - startTime;

  return JSON.stringify(
    {
      success: true,
      message: 'Workspace reindexed successfully',
      elapsed_ms: elapsed,
      indexed: result.indexed,
      skipped: result.skipped,
      errors: result.errors,
    },
    null,
    2
  );
}

export async function handleClearIndex(
  _args: ClearIndexArgs,
  serviceClient: ContextServiceClient
): Promise<string> {
  await serviceClient.clearIndex();
  return JSON.stringify(
    {
      success: true,
      message: 'Index cleared. Re-run index_workspace to rebuild.',
    },
    null,
    2
  );
}

export const reindexWorkspaceTool = {
  name: 'reindex_workspace',
  description: 'Clear current index state and rebuild it from scratch.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const clearIndexTool = {
  name: 'clear_index',
  description: 'Remove saved index state and clear caches without rebuilding.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
