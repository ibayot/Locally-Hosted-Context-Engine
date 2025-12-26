import type { EnterpriseFinding } from '../../types.js';
import type { StaticAnalyzerId, StaticAnalyzerInput, StaticAnalyzerResult } from './types.js';
import { runTscAnalyzer } from './tsc.js';
import { runSemgrepAnalyzer } from './semgrep.js';

export async function runStaticAnalyzers(args: {
  input: StaticAnalyzerInput;
  analyzers: StaticAnalyzerId[];
  timeoutMs: number;
  maxFindingsPerAnalyzer: number;
  semgrepArgs?: string[];
}): Promise<{ findings: EnterpriseFinding[]; results: StaticAnalyzerResult[]; warnings: string[] }> {
  const warnings: string[] = [];
  const results: StaticAnalyzerResult[] = [];
  const findings: EnterpriseFinding[] = [];

  for (const analyzer of args.analyzers) {
    try {
      if (analyzer === 'tsc') {
        const r = await runTscAnalyzer(args.input, { timeoutMs: args.timeoutMs, maxFindings: args.maxFindingsPerAnalyzer });
        results.push(r);
        findings.push(...r.findings);
        warnings.push(...r.warnings);
      } else if (analyzer === 'semgrep') {
        const r = await runSemgrepAnalyzer(args.input, {
          timeoutMs: args.timeoutMs,
          maxFindings: args.maxFindingsPerAnalyzer,
          args: args.semgrepArgs,
        });
        results.push(r);
        findings.push(...r.findings);
        warnings.push(...r.warnings);
      }
    } catch (e) {
      warnings.push(`Static analyzer ${analyzer} failed: ${String(e)}`);
    }
  }

  return { findings, results, warnings };
}

