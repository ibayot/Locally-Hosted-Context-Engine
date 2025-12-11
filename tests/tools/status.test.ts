/**
 * Unit tests for index_status tool
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { handleIndexStatus, indexStatusTool } from '../../src/mcp/tools/status.js';
import { IndexStatus } from '../../src/mcp/serviceClient.js';

describe('index_status Tool', () => {
  let mockServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const status: IndexStatus = {
      workspace: '/tmp/workspace',
      status: 'idle',
      lastIndexed: '2025-01-11T00:00:00.000Z',
      fileCount: 42,
      isStale: false,
    };

    mockServiceClient = {
      getIndexStatus: jest.fn().mockReturnValue(status),
    };
  });

  it('should render status markdown', async () => {
    const result = await handleIndexStatus({}, mockServiceClient as any);

    expect(result).toContain('# 🩺 Index Status');
    expect(result).toContain('**Workspace**');
    expect(result).toContain('**Status**');
    expect(result).toContain('42');
  });

  it('should expose tool schema', () => {
    expect(indexStatusTool.name).toBe('index_status');
    expect(indexStatusTool.inputSchema).toBeDefined();
  });
});
