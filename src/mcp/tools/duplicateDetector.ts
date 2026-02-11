/**
 * Layer 3: MCP Interface Layer - Duplicate Detector Tool
 *
 * Finds near-duplicate or copy-pasted code blocks by comparing
 * normalized function bodies across the workspace.
 *
 * Uses the local AST parser — no LLM required.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { getASTParser, CodeSymbol } from '../../local/astParser.js';
import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface FindDuplicatesArgs {
    min_lines?: number;      // Minimum function length to consider (default: 5)
    max_results?: number;    // Max duplicate groups to return (default: 20)
    paths?: string[];        // Limit to specific directories
}

interface FunctionBlock {
    name: string;
    file: string;
    startLine: number;
    endLine: number;
    hash: string;
    lines: number;
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
// Implementation
// ============================================================================

/**
 * Normalize code for comparison:
 * - Strip comments, whitespace
 * - Normalize variable names wouldn't be perfect, but stripping whitespace
 *   and comments catches exact copy-paste
 */
function normalizeCode(code: string): string {
    return code
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .filter(l => !l.startsWith('//'))
        .filter(l => !l.startsWith('#'))
        .filter(l => !l.startsWith('*'))
        .filter(l => !l.startsWith('/*'))
        .join('\n');
}

function hashCode(code: string): string {
    return crypto.createHash('md5').update(code).digest('hex');
}

async function collectFunctionBlocks(
    dir: string,
    workspacePath: string,
    parser: ReturnType<typeof getASTParser>,
    blocks: FunctionBlock[],
    minLines: number,
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
                await collectFunctionBlocks(fullPath, workspacePath, parser, blocks, minLines, limitPaths);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!PARSEABLE_EXTENSIONS.has(ext)) continue;

                if (limitPaths && limitPaths.length > 0) {
                    const inScope = limitPaths.some(p => relPath.startsWith(p));
                    if (!inScope) continue;
                }

                try {
                    const stat = await fs.stat(fullPath);
                    if (stat.size > 500_000) continue;

                    const content = await fs.readFile(fullPath, 'utf-8');
                    const allLines = content.split('\n');
                    const analysis = parser.analyze(fullPath, content);

                    for (const sym of analysis.symbols) {
                        if (sym.kind !== 'function' && sym.kind !== 'method') continue;

                        const startIdx = sym.startLine - 1;
                        const endIdx = Math.min(sym.endLine, allLines.length);
                        const funcLines = allLines.slice(startIdx, endIdx);
                        const lineCount = funcLines.length;

                        if (lineCount < minLines) continue;

                        const normalized = normalizeCode(funcLines.join('\n'));
                        if (normalized.length < 20) continue; // Too short after normalization

                        blocks.push({
                            name: sym.name,
                            file: relPath,
                            startLine: sym.startLine,
                            endLine: sym.endLine,
                            hash: hashCode(normalized),
                            lines: lineCount,
                            parent: sym.parent,
                        });
                    }
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

export async function handleFindDuplicates(
    args: FindDuplicatesArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    const workspacePath = serviceClient.getWorkspacePath();
    const parser = getASTParser();
    const minLines = args.min_lines || 5;
    const maxResults = Math.min(args.max_results || 20, 100);

    const blocks: FunctionBlock[] = [];
    await collectFunctionBlocks(workspacePath, workspacePath, parser, blocks, minLines, args.paths);

    if (blocks.length === 0) {
        return `# 🔍 Duplicate Detector\n\n_No function blocks found to analyze._\n`;
    }

    // Group by hash
    const groups = new Map<string, FunctionBlock[]>();
    for (const block of blocks) {
        const existing = groups.get(block.hash) || [];
        existing.push(block);
        groups.set(block.hash, existing);
    }

    // Filter to only duplicate groups (hash appears 2+ times)
    const duplicateGroups = Array.from(groups.values())
        .filter(g => g.length > 1)
        .sort((a, b) => {
            // Sort by total lines (most code duplicated first)
            const totalA = a[0].lines * a.length;
            const totalB = b[0].lines * b.length;
            return totalB - totalA;
        })
        .slice(0, maxResults);

    if (duplicateGroups.length === 0) {
        return `# 🔍 Duplicate Detector\n\n✅ _No duplicates found._\n\nScanned ${blocks.length} functions across the workspace.\n`;
    }

    const totalDuplicateLines = duplicateGroups.reduce(
        (sum, group) => sum + group[0].lines * (group.length - 1), 0
    );

    let output = `# 🔍 Duplicate Detector\n\n`;
    output += `**Found:** ${duplicateGroups.length} duplicate groups\n`;
    output += `**Redundant Lines:** ~${totalDuplicateLines} lines of duplicated code\n`;
    output += `**Functions Scanned:** ${blocks.length}\n\n`;

    output += `## Duplicate Groups\n\n`;

    for (let i = 0; i < duplicateGroups.length; i++) {
        const group = duplicateGroups[i];
        const representative = group[0];
        output += `### ${i + 1}. \`${representative.name}\` (${representative.lines} lines × ${group.length} copies)\n\n`;

        output += `| File | Lines | Context |\n|------|-------|--------|\n`;
        for (const block of group) {
            const parent = block.parent ? `in \`${block.parent}\`` : '';
            output += `| \`${block.file}\` | ${block.startLine}-${block.endLine} | ${parent} |\n`;
        }
        output += `\n`;
    }

    output += `---\n\n`;
    output += `> **Tip:** Consider extracting duplicate functions into a shared utility module.\n`;

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const findDuplicatesTool = {
    name: 'find_duplicates',
    description: `Find duplicate or copy-pasted functions across the workspace.

Compares normalized function bodies to detect exact and near-exact duplicates.
Groups duplicate functions and shows their locations for consolidation.

Use this tool when you need to:
- Find copy-pasted code that should be refactored
- Identify duplicate functions across different modules
- Assess code duplication in the codebase
- Prioritize refactoring efforts`,
    inputSchema: {
        type: 'object',
        properties: {
            min_lines: {
                type: 'number',
                description: 'Minimum function length in lines to consider (default: 5)',
                default: 5,
            },
            max_results: {
                type: 'number',
                description: 'Maximum duplicate groups to return (default: 20, max: 100)',
                default: 20,
            },
            paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Limit analysis to specific directories (e.g., ["src", "lib"])',
            },
        },
        required: [],
    },
};
