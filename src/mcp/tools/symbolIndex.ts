/**
 * Layer 3: MCP Interface Layer - Symbol Index Tool
 *
 * Provides precise symbol lookup: find functions, classes, interfaces,
 * types, and enums by name across the entire workspace.
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

export interface FindSymbolArgs {
    name: string;          // Symbol name to search for
    kind?: string;         // Filter by kind: class, function, interface, type, enum
    exact?: boolean;       // Exact match vs. contains (default: false)
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

async function collectSymbols(
    dir: string,
    workspacePath: string,
    parser: ReturnType<typeof getASTParser>,
    symbols: CodeSymbol[],
    maxFiles: number,
    fileCount: { n: number }
): Promise<void> {
    if (fileCount.n >= maxFiles) return;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (fileCount.n >= maxFiles) return;
            if (SKIP_DIRS.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await collectSymbols(fullPath, workspacePath, parser, symbols, maxFiles, fileCount);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!PARSEABLE_EXTENSIONS.has(ext)) continue;

                try {
                    const stat = await fs.stat(fullPath);
                    if (stat.size > 500_000) continue; // Skip files >500KB

                    const content = await fs.readFile(fullPath, 'utf-8');
                    const analysis = parser.analyze(fullPath, content);

                    // Use relative paths
                    for (const sym of analysis.symbols) {
                        sym.filePath = path.relative(workspacePath, sym.filePath).replace(/\\/g, '/');
                    }

                    symbols.push(...analysis.symbols);
                    fileCount.n++;
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

export async function handleFindSymbol(
    args: FindSymbolArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    if (!args.name || args.name.trim().length === 0) {
        throw new Error('Symbol name is required');
    }

    const workspacePath = serviceClient.getWorkspacePath();
    const parser = getASTParser();
    const allSymbols: CodeSymbol[] = [];
    const fileCount = { n: 0 };

    await collectSymbols(workspacePath, workspacePath, parser, allSymbols, 2000, fileCount);

    // Filter by name
    const searchName = args.name.trim();
    const exact = args.exact === true;
    let matches = allSymbols.filter(s => {
        if (exact) return s.name === searchName;
        return s.name.toLowerCase().includes(searchName.toLowerCase());
    });

    // Filter by kind if specified
    if (args.kind) {
        const kind = args.kind.toLowerCase();
        matches = matches.filter(s => s.kind === kind);
    }

    if (matches.length === 0) {
        return `# 🔍 Symbol Search: \`${searchName}\`\n\n_No symbols found matching "${searchName}"._\n\nScanned ${fileCount.n} files, ${allSymbols.length} total symbols.\n`;
    }

    // Sort: exact matches first, then by file path
    matches.sort((a, b) => {
        const aExact = a.name === searchName ? 0 : 1;
        const bExact = b.name === searchName ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.filePath.localeCompare(b.filePath);
    });

    // Limit results
    const limited = matches.slice(0, 50);

    let output = `# 🔍 Symbol Search: \`${searchName}\`\n\n`;
    output += `**Found:** ${matches.length} symbols in ${fileCount.n} files\n\n`;

    output += `| Symbol | Kind | File | Lines | Exported |\n`;
    output += `|--------|------|------|-------|----------|\n`;

    for (const sym of limited) {
        const exported = sym.exported ? '✅' : '❌';
        const parent = sym.parent ? ` (${sym.parent})` : '';
        output += `| \`${sym.name}\`${parent} | ${sym.kind} | \`${sym.filePath}\` | ${sym.startLine}-${sym.endLine} | ${exported} |\n`;
    }

    if (matches.length > 50) {
        output += `\n_...and ${matches.length - 50} more results_\n`;
    }

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const findSymbolTool = {
    name: 'find_symbol',
    description: `Search for code symbols (functions, classes, interfaces, types, enums) by name across the workspace.

Provides precise symbol lookup with file location, line numbers, and export status.

Use this tool when you need to:
- Find where a function or class is defined
- Locate all implementations of a specific interface
- Find all exported symbols matching a pattern
- Explore the codebase structure by symbol name`,
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Symbol name to search for (case-insensitive unless exact=true)',
            },
            kind: {
                type: 'string',
                enum: ['class', 'function', 'method', 'interface', 'type', 'enum', 'variable', 'constant'],
                description: 'Filter by symbol kind (optional)',
            },
            exact: {
                type: 'boolean',
                description: 'If true, only match exact symbol names (default: false, uses contains matching)',
                default: false,
            },
        },
        required: ['name'],
    },
};
