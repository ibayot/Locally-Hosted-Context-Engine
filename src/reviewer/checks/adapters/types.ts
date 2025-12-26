import type { EnterpriseFinding } from '../../types.js';

export type StaticAnalyzerId = 'tsc' | 'semgrep';

export interface StaticAnalyzerInput {
  workspace_path: string;
  changed_files: string[];
  diff?: string;
}

export interface StaticAnalyzerResult {
  analyzer: StaticAnalyzerId;
  duration_ms: number;
  findings: EnterpriseFinding[];
  warnings: string[];
  skipped_reason?: string;
}

