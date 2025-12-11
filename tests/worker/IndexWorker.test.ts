import { describe, it, expect } from '@jest/globals';
import { runIndexJob } from '../../src/worker/IndexWorker.js';

describe('IndexWorker', () => {
  it('emits completion message in mock mode', async () => {
    const messages: any[] = [];
    await runIndexJob(
      { workspacePath: process.cwd(), mock: true },
      (msg) => messages.push(msg)
    );

    expect(messages[0].type).toBe('index_complete');
  });
});
