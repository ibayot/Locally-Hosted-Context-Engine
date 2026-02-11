/**
 * Layer 3: MCP Interface Layer - File Statistics Tool
 *
 * Provides workspace-level statistics: lines of code per language,
 * file counts, largest files, and language distribution.
 *
 * Fully local, deterministic — no LLM required.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface FileStatsArgs {
    include_largest?: boolean;  // Include top-10 largest files (default: true)
    top_n?: number;             // Number of largest files to show (default: 10)
}

interface LanguageStats {
    files: number;
    lines: number;
    bytes: number;
}

// ============================================================================
// Constants
// ============================================================================

const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'build', '.git', '.next', '__pycache__',
    'vendor', '.dart_tool', 'Pods', '.pub-cache', 'coverage',
    '.local-context', '.memories', '.augment-context-state.json',
]);

const EXT_TO_LANGUAGE: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript (JSX)',
    '.js': 'JavaScript', '.jsx': 'JavaScript (JSX)',
    '.mjs': 'JavaScript (ESM)', '.cjs': 'JavaScript (CJS)',
    '.py': 'Python', '.pyi': 'Python (Stub)',
    '.dart': 'Dart', '.arb': 'Dart (ARB)',
    '.go': 'Go', '.rs': 'Rust',
    '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin Script', '.scala': 'Scala',
    '.c': 'C', '.cpp': 'C++', '.cc': 'C++', '.h': 'C/C++ Header', '.hpp': 'C++ Header',
    '.cs': 'C#', '.fs': 'F#',
    '.swift': 'Swift', '.m': 'Objective-C',
    '.rb': 'Ruby', '.php': 'PHP',
    '.ex': 'Elixir', '.exs': 'Elixir Script',
    '.hs': 'Haskell', '.ml': 'OCaml', '.lua': 'Lua', '.r': 'R',
    '.sql': 'SQL',
    '.sh': 'Shell', '.bash': 'Bash', '.ps1': 'PowerShell',
    '.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro',
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less',
    '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML', '.xml': 'XML',
    '.graphql': 'GraphQL', '.proto': 'Protocol Buffers',
    '.tf': 'Terraform', '.hcl': 'HCL',
    '.md': 'Markdown', '.mdx': 'MDX', '.txt': 'Text', '.rst': 'reStructuredText',
};

// ============================================================================
// Implementation
// ============================================================================

interface FileInfo {
    relPath: string;
    bytes: number;
    lines: number;
    ext: string;
}

async function walkAndCollect(
    dir: string,
    workspacePath: string,
    files: FileInfo[]
): Promise<void> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await walkAndCollect(fullPath, workspacePath, files);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!EXT_TO_LANGUAGE[ext]) continue;

                try {
                    const stat = await fs.stat(fullPath);
                    if (stat.size > 5_000_000) continue; // Skip files >5MB

                    const content = await fs.readFile(fullPath, 'utf-8');
                    const lineCount = content.split('\n').length;

                    files.push({
                        relPath: path.relative(workspacePath, fullPath).replace(/\\/g, '/'),
                        bytes: stat.size,
                        lines: lineCount,
                        ext,
                    });
                } catch {
                    // Skip unreadable files
                }
            }
        }
    } catch {
        // Skip unreadable directories
    }
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleFileStats(
    args: FileStatsArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    const includeLargest = args.include_largest !== false;
    const topN = Math.min(args.top_n || 10, 50);
    const workspacePath = serviceClient.getWorkspacePath();

    const files: FileInfo[] = [];
    await walkAndCollect(workspacePath, workspacePath, files);

    if (files.length === 0) {
        return `# 📊 File Statistics\n\n_No source files found in workspace._\n`;
    }

    // Aggregate by language
    const langStats = new Map<string, LanguageStats>();
    for (const file of files) {
        const lang = EXT_TO_LANGUAGE[file.ext] || 'Other';
        const existing = langStats.get(lang) || { files: 0, lines: 0, bytes: 0 };
        existing.files += 1;
        existing.lines += file.lines;
        existing.bytes += file.bytes;
        langStats.set(lang, existing);
    }

    // Sort by lines descending
    const sorted = [...langStats.entries()].sort((a, b) => b[1].lines - a[1].lines);

    const totalFiles = files.length;
    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
    const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);

    let output = `# 📊 File Statistics\n\n`;
    output += `| Metric | Value |\n|--------|-------|\n`;
    output += `| Total Files | ${totalFiles.toLocaleString()} |\n`;
    output += `| Total Lines | ${totalLines.toLocaleString()} |\n`;
    output += `| Total Size | ${formatBytes(totalBytes)} |\n`;
    output += `| Languages | ${langStats.size} |\n\n`;

    // Language breakdown
    output += `## Language Breakdown\n\n`;
    output += `| Language | Files | Lines | Size | % of Code |\n`;
    output += `|----------|-------|-------|------|----------|\n`;
    for (const [lang, stats] of sorted) {
        const pct = totalLines > 0 ? ((stats.lines / totalLines) * 100).toFixed(1) : '0.0';
        output += `| ${lang} | ${stats.files} | ${stats.lines.toLocaleString()} | ${formatBytes(stats.bytes)} | ${pct}% |\n`;
    }
    output += `\n`;

    // Largest files
    if (includeLargest) {
        const largest = [...files].sort((a, b) => b.lines - a.lines).slice(0, topN);
        output += `## Top ${topN} Largest Files (by lines)\n\n`;
        output += `| # | File | Lines | Size |\n`;
        output += `|---|------|-------|------|\n`;
        largest.forEach((f, i) => {
            output += `| ${i + 1} | \`${f.relPath}\` | ${f.lines.toLocaleString()} | ${formatBytes(f.bytes)} |\n`;
        });
        output += `\n`;
    }

    return output;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const fileStatsTool = {
    name: 'file_statistics',
    description: `Get workspace file statistics: lines of code per language, file counts, total size, and largest files.

Use this tool when you need to:
- Understand the size and composition of a codebase
- Identify the primary languages used
- Find the largest files that may need refactoring
- Get a quick overview of project scope`,
    inputSchema: {
        type: 'object',
        properties: {
            include_largest: {
                type: 'boolean',
                description: 'Include a list of the largest files (default: true)',
                default: true,
            },
            top_n: {
                type: 'number',
                description: 'Number of largest files to show (default: 10, max: 50)',
                default: 10,
            },
        },
        required: [],
    },
};
