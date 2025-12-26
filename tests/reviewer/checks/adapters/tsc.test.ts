import { describe, it, expect } from '@jest/globals';
import { parseTscOutput } from '../../../../src/reviewer/checks/adapters/tsc.js';

describe('reviewer/checks/adapters/tsc', () => {
  it('parses standard tsc error lines', () => {
    const output = [
      "src/a.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/b.ts(1,1): error TS7006: Parameter 'x' implicitly has an 'any' type.",
      '',
    ].join('\n');

    const errors = parseTscOutput(output);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ file: 'src/a.ts', line: 12, column: 5, code: 'TS2322' });
    expect(errors[1]).toMatchObject({ file: 'src/b.ts', line: 1, column: 1, code: 'TS7006' });
  });
});
