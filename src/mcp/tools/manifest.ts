/**
 * Layer 3: MCP Interface Layer - Tool Manifest
 *
 * Provides capability discovery for MCP clients.
 */

import { ContextServiceClient } from '../serviceClient.js';

export interface ToolManifestArgs {
  // No arguments
}

const manifest = {
  version: '1.0.0',
  capabilities: [
    'semantic_search',
    'file_retrieval',
    'context_enhancement',
    'index_status',
    'lifecycle',
    'automation',
    'policy',
  ],
  tools: [
    'index_workspace',
    'semantic_search',
    'get_file',
    'get_context_for_prompt',
    'enhance_prompt',
    'index_status',
    'reindex_workspace',
    'clear_index',
  ],
};

export async function handleToolManifest(
  _args: ToolManifestArgs,
  _serviceClient: ContextServiceClient
): Promise<string> {
  return JSON.stringify(manifest, null, 2);
}

export const toolManifestTool = {
  name: 'tool_manifest',
  description: 'Discover available tools and capabilities exposed by the server.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
