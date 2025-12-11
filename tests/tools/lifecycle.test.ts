/**
 * Unit tests for lifecycle tools
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  handleReindexWorkspace,
  handleClearIndex,
  reindexWorkspaceTool,
  clearIndexTool,
} from '../../src/mcp/tools/lifecycle.js';
import { IndexResult } from '../../src/mcp/serviceClient.js';

describe('lifecycle Tools', () => {
  let mockServiceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const result: IndexResult = {
      indexed: 10,
      skipped: 1,
      errors: [],
      duration: 100,
    };
    mockServiceClient = {
      clearIndex: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      indexWorkspace: jest.fn<() => Promise<IndexResult>>().mockResolvedValue(result),
    };
  });

  it('should clear index', async () => {
    const result = await handleClearIndex({}, mockServiceClient as any);
    expect(mockServiceClient.clearIndex).toHaveBeenCalled();
    expect(result).toContain('Index cleared');
  });

  it('should reindex workspace after clearing', async () => {
    const result = await handleReindexWorkspace({}, mockServiceClient as any);

    expect(mockServiceClient.clearIndex).toHaveBeenCalledTimes(1);
    expect(mockServiceClient.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(result).toContain('"indexed": 10');
  });

  it('should expose tool schemas', () => {
    expect(reindexWorkspaceTool.name).toBe('reindex_workspace');
    expect(clearIndexTool.name).toBe('clear_index');
  });
});
