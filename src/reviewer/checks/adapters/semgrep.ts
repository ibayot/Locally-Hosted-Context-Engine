import path from 'node:path';
import type { EnterpriseFinding, FindingSeverity } from '../../types.js';
import type { StaticAnalyzerInput, StaticAnalyzerResult } from './types.js';
import { runCommand } from './exec.js';

function mapSeverity(raw: unknown): FindingSeverity {
  const s = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (s === 'ERROR' || s === 'CRITICAL') return 'CRITICAL';
  if (s === 'WARNING' || s === 'HIGH') return 'HIGH';
  if (s === 'MEDIUM') return 'MEDIUM';
  if (s === 'INFO' || s === 'LOW') return 'LOW';
  return 'MEDIUM';
}

export async function runSemgrepAnalyzer(
  input: StaticAnalyzerInput,
  opts: { timeoutMs: number; maxFindings: number; args?: string[] }
): Promise<StaticAnalyzerResult> {
  const command = process.platform === 'win32' ? 'semgrep.exe' : 'semgrep';
  const commandArgs = ['--json', ...(opts.args ?? ['--config', 'auto']), '--quiet', ...input.changed_files];

  const result = await runCommand({
    command,
    commandArgs,
    cwd: input.workspace_path,
    timeoutMs: opts.timeoutMs,
  });

  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (result.exitCode !== 0 && /not recognized|ENOENT|No such file or directory/i.test(combined)) {
    return {
      analyzer: 'semgrep',
      duration_ms: result.duration_ms,
      findings: [],
      warnings: ['semgrep not found on PATH; skipping'],
      skipped_reason: 'semgrep_missing',
    };
  }

  let parsed: any;
  try {
    parsed = combined.length > 0 ? JSON.parse(combined) : null;
  } catch {
    return {
      analyzer: 'semgrep',
      duration_ms: result.duration_ms,
      findings: [],
      warnings: ['semgrep did not return valid JSON; skipping'],
      skipped_reason: 'semgrep_invalid_json',
    };
  }

  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const findings: EnterpriseFinding[] = results.slice(0, Math.max(0, opts.maxFindings)).map((r: any, idx: number) => {
    const checkId = typeof r?.check_id === 'string' ? r.check_id : `unknown-${idx + 1}`;
    const file = typeof r?.path === 'string' ? r.path : '(unknown file)';
    const startLine = Number(r?.start?.line ?? 1);
    const endLine = Number(r?.end?.line ?? startLine);
    const message = typeof r?.extra?.message === 'string' ? r.extra.message : 'Semgrep finding';
    const severity = mapSeverity(r?.extra?.severity);
    return {
      id: `SEMGREP-${checkId}-${idx + 1}`,
      severity,
      category: 'security',
      confidence: 0.85,
      title: message,
      location: { file: path.normalize(file), startLine, endLine },
      evidence: [checkId],
      impact: 'Semgrep detected a pattern that may indicate a bug or security issue.',
      recommendation: 'Review the finding and either fix the code or suppress it with a documented justification.',
    };
  });

  const warnings: string[] = [];
  if (result.exitCode !== 0 && findings.length === 0) {
    warnings.push('semgrep exited non-zero and produced no parseable results');
  }

  return {
    analyzer: 'semgrep',
    duration_ms: result.duration_ms,
    findings,
    warnings,
  };
}

