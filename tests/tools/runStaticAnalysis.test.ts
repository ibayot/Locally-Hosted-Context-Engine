import { describe, it, expect } from '@jest/globals';
import { handleRunStaticAnalysis } from '../../src/mcp/tools/staticAnalysis.js';

describe('run_static_analysis tool', () => {
  it('runs with empty analyzer list (no-op)', async () => {
    const resultStr = await handleRunStaticAnalysis(
      { changed_files: [], options: { analyzers: [] } },
      { getWorkspacePath: () => process.cwd() } as any
    );
    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.analyzers)).toBe(true);
    expect(result.analyzers).toHaveLength(0);
    expect(Array.isArray(result.findings)).toBe(true);
  });
});

