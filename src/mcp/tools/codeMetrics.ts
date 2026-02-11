/**
 * Layer 3: MCP Interface Layer - Code Metrics Tool
 *
 * Provides code quality metrics: cyclomatic complexity, nesting depth,
 * function length, and overall file health scores.
 *
 * Uses the local AST parser — no LLM required.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getASTParser, CodeSymbol } from '../../local/astParser.js';
import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface CodeMetricsArgs {
    file?: string;          // Analyze specific file (optional)
    paths?: string[];       // Analyze specific directories (optional)
    threshold?: number;     // Only show functions above this complexity (default: 5)
}

interface FunctionMetric {
    name: string;
    file: string;
    startLine: number;
    endLine: number;
    lines: number;
    complexity: number;
    maxNesting: number;
    parent?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'build', '.git', '.next', '__pycache__',
    'vendor', '.dart_tool', 'Pods', '.pub-cache', 'coverage',
    '.local-context', '.memories',
]);

const PARSEABLE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyi', '.go', '.rs',
    '.java', '.kt', '.scala',
    '.c', '.cpp', '.cc', '.h', '.hpp',
    '.cs', '.rb', '.php',
]);

// ============================================================================
// Complexity Analysis
// ============================================================================

/**
 * Calculate cyclomatic complexity of a code block.
 * Counts decision points: if, else if, for, while, case, catch, &&, ||, ?:
 */
function calculateComplexity(lines: string[]): number {
    let complexity = 1; // Base complexity

    const decisionPatterns = [
        /\bif\s*\(/,
        /\belse\s+if\s*\(/,
        /\bfor\s*\(/,
        /\bwhile\s*\(/,
        /\bcase\s+/,
        /\bcatch\s*\(/,
        /\?\s*[^?]/,     // Ternary operator
        /&&/,
        /\|\|/,
        /\?\?/,           // Nullish coalescing
    ];

    for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;

        for (const pattern of decisionPatterns) {
            if (pattern.test(trimmed)) complexity++;
        }
    }

    return complexity;
}

/**
 * Calculate maximum nesting depth of a code block.
 */
function calculateMaxNesting(lines: string[]): number {
    let maxNesting = 0;
    let currentNesting = 0;

    for (const line of lines) {
        for (const ch of line) {
            if (ch === '{') {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            } else if (ch === '}') {
                currentNesting--;
            }
        }
    }

    return maxNesting;
}

// ============================================================================
// Implementation
// ============================================================================

async function analyzeFile(
    fullPath: string,
    workspacePath: string,
    parser: ReturnType<typeof getASTParser>,
    metrics: FunctionMetric[]
): Promise<void> {
    try {
        const stat = await fs.stat(fullPath);
        if (stat.size > 500_000) return;

        const content = await fs.readFile(fullPath, 'utf-8');
        const allLines = content.split('\n');
        const analysis = parser.analyze(fullPath, content);
        const relPath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');

        // Analyze each function/method
        for (const sym of analysis.symbols) {
            if (sym.kind !== 'function' && sym.kind !== 'method') continue;

            const startIdx = sym.startLine - 1;
            const endIdx = Math.min(sym.endLine, allLines.length);
            const funcLines = allLines.slice(startIdx, endIdx);

            metrics.push({
                name: sym.name,
                file: relPath,
                startLine: sym.startLine,
                endLine: sym.endLine,
                lines: funcLines.length,
                complexity: calculateComplexity(funcLines),
                maxNesting: calculateMaxNesting(funcLines),
                parent: sym.parent,
            });
        }
    } catch {
        // Skip unreadable files
    }
}

async function walkAndAnalyze(
    dir: string,
    workspacePath: string,
    parser: ReturnType<typeof getASTParser>,
    metrics: FunctionMetric[],
    limitPaths?: string[]
): Promise<void> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
                if (limitPaths && limitPaths.length > 0) {
                    const inScope = limitPaths.some(p => relPath.startsWith(p) || p.startsWith(relPath));
                    if (!inScope) continue;
                }
                await walkAndAnalyze(fullPath, workspacePath, parser, metrics, limitPaths);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!PARSEABLE_EXTENSIONS.has(ext)) continue;

                if (limitPaths && limitPaths.length > 0) {
                    const inScope = limitPaths.some(p => relPath.startsWith(p));
                    if (!inScope) continue;
                }

                await analyzeFile(fullPath, workspacePath, parser, metrics);
            }
        }
    } catch {
        // Skip unreadable directories
    }
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleCodeMetrics(
    args: CodeMetricsArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    const workspacePath = serviceClient.getWorkspacePath();
    const parser = getASTParser();
    const threshold = args.threshold || 5;
    const metrics: FunctionMetric[] = [];

    if (args.file) {
        // Single file analysis
        const fullPath = path.isAbsolute(args.file)
            ? args.file
            : path.join(workspacePath, args.file);
        await analyzeFile(fullPath, workspacePath, parser, metrics);
    } else {
        // Workspace-wide analysis
        await walkAndAnalyze(workspacePath, workspacePath, parser, metrics, args.paths);
    }

    if (metrics.length === 0) {
        return `# 📈 Code Metrics\n\n_No functions found to analyze._\n`;
    }

    // Summary stats
    const totalFuncs = metrics.length;
    const avgComplexity = metrics.reduce((s, m) => s + m.complexity, 0) / totalFuncs;
    const avgLines = metrics.reduce((s, m) => s + m.lines, 0) / totalFuncs;

    // Sort by complexity descending
    const sorted = [...metrics].sort((a, b) => b.complexity - a.complexity);
    const complex = sorted.filter(m => m.complexity >= threshold);

    // Health ratings
    const highComplexity = metrics.filter(m => m.complexity > 10).length;
    const longFunctions = metrics.filter(m => m.lines > 50).length;
    const deepNesting = metrics.filter(m => m.maxNesting > 4).length;

    let healthScore = 'A';
    const issues = highComplexity + longFunctions + deepNesting;
    if (issues > totalFuncs * 0.3) healthScore = 'D';
    else if (issues > totalFuncs * 0.2) healthScore = 'C';
    else if (issues > totalFuncs * 0.1) healthScore = 'B';

    let output = `# 📈 Code Metrics\n\n`;

    // Overall health
    output += `## Health Score: **${healthScore}**\n\n`;
    output += `| Metric | Value |\n|--------|-------|\n`;
    output += `| Total Functions | ${totalFuncs} |\n`;
    output += `| Avg Complexity | ${avgComplexity.toFixed(1)} |\n`;
    output += `| Avg Lines/Function | ${avgLines.toFixed(0)} |\n`;
    output += `| High Complexity (>10) | ${highComplexity} |\n`;
    output += `| Long Functions (>50 lines) | ${longFunctions} |\n`;
    output += `| Deep Nesting (>4) | ${deepNesting} |\n\n`;

    // Complex functions
    if (complex.length > 0) {
        output += `## ⚠️ Functions Above Complexity Threshold (≥${threshold})\n\n`;
        output += `| Function | File | Lines | Complexity | Nesting |\n`;
        output += `|----------|------|-------|------------|--------|\n`;

        for (const m of complex.slice(0, 30)) {
            const parent = m.parent ? `${m.parent}.` : '';
            const complexityIcon = m.complexity > 15 ? '🔴' : m.complexity > 10 ? '🟡' : '🟢';
            output += `| \`${parent}${m.name}\` | \`${m.file}:${m.startLine}\` | ${m.lines} | ${complexityIcon} ${m.complexity} | ${m.maxNesting} |\n`;
        }

        if (complex.length > 30) {
            output += `\n_...and ${complex.length - 30} more_\n`;
        }
        output += `\n`;
    } else {
        output += `## ✅ All functions are below complexity threshold (${threshold})\n\n`;
    }

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const codeMetricsTool = {
    name: 'code_metrics',
    description: `Analyze code quality metrics: cyclomatic complexity, function length, nesting depth, and overall health score.

Provides:
- Health score (A-D) based on code quality indicators
- Per-function complexity analysis
- Identification of high-complexity functions that may need refactoring

Use this tool when you need to:
- Assess code quality and maintainability
- Find complex functions that need refactoring
- Get an overall health score for the codebase
- Identify deeply nested or overly long functions`,
    inputSchema: {
        type: 'object',
        properties: {
            file: {
                type: 'string',
                description: 'Analyze a specific file (relative path). If omitted, analyzes the whole workspace.',
            },
            paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Limit analysis to specific directories (e.g., ["src", "lib"])',
            },
            threshold: {
                type: 'number',
                description: 'Only show functions with complexity >= this value (default: 5)',
                default: 5,
            },
        },
        required: [],
    },
};
