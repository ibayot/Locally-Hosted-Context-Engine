/**
 * Layer 3: MCP Interface Layer - Index Status Tool
 *
 * Provides index health/metadata for observability.
 */

import { ContextServiceClient, IndexStatus } from '../serviceClient.js';

export interface IndexStatusArgs {
  // No arguments required for now
}

function formatStatus(status: IndexStatus): string {
  const statusEmoji =
    status.status === 'indexing' ? '⏳' : status.status === 'error' ? '⚠️' : '✅';

  return `# 🩺 Index Status\n\n` +
    `| Property | Value |\n` +
    `|----------|-------|\n` +
    `| **Workspace** | \`${status.workspace}\` |\n` +
    `| **Status** | ${statusEmoji} ${status.status} |\n` +
    `| **Last Indexed** | ${status.lastIndexed ?? 'never'} |\n` +
    `| **File Count** | ${status.fileCount} |\n` +
    `| **Is Stale** | ${status.isStale ? 'Yes' : 'No'} |\n` +
    `| **Last Error** | ${status.lastError ?? 'None'} |\n`;
}

export async function handleIndexStatus(
  _args: IndexStatusArgs,
  serviceClient: ContextServiceClient
): Promise<string> {
  const status = serviceClient.getIndexStatus();
  return formatStatus(status);
}

export const indexStatusTool = {
  name: 'index_status',
  description: 'Retrieve current index health metadata (status, last indexed time, file count, staleness).',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
