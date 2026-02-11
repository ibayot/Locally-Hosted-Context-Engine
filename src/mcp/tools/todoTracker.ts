/**
 * Layer 3: MCP Interface Layer - TODO Tracker Tool
 *
 * Scans the workspace for TODO, FIXME, HACK, XXX, NOTE comments
 * and returns them grouped by file with line numbers.
 *
 * Fully local, deterministic — no LLM required.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface FindTodosArgs {
    tags?: string[];       // Filter to specific tags (default: all)
    max_results?: number;  // Max results to return (default: 100)
    paths?: string[];      // Limit to specific subdirectories
}

interface TodoItem {
    file: string;
    line: number;
    tag: string;
    text: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TAGS = ['TODO', 'FIXME', 'HACK', 'XXX', 'NOTE', 'BUG', 'WARN', 'DEPRECATED'];
const MAX_FILE_SIZE = 1_000_000; // 1MB — skip huge files

// Extensions to scan (code and docs files only)
const SCANNABLE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyi', '.dart', '.go', '.rs',
    '.java', '.kt', '.kts', '.scala',
    '.c', '.cpp', '.cc', '.h', '.hpp',
    '.cs', '.fs', '.swift', '.m',
    '.rb', '.php', '.ex', '.exs', '.lua', '.r',
    '.sh', '.bash', '.ps1',
    '.vue', '.svelte', '.astro',
    '.html', '.css', '.scss',
    '.sql', '.graphql', '.proto',
    '.yaml', '.yml', '.toml',
    '.md', '.mdx', '.txt',
]);

// Directories to always skip
const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'build', '.git', '.next', '__pycache__',
    'vendor', '.dart_tool', 'Pods', '.pub-cache', 'coverage',
    '.local-context', '.memories',
]);

// ============================================================================
// Implementation
// ============================================================================

async function walkAndScan(
    dir: string,
    workspacePath: string,
    tagRegex: RegExp,
    results: TodoItem[],
    maxResults: number,
    limitPaths?: string[]
): Promise<void> {
    if (results.length >= maxResults) return;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (results.length >= maxResults) return;

            if (SKIP_DIRS.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
                // If paths filter is specified, check if this dir is within scope
                if (limitPaths && limitPaths.length > 0) {
                    const inScope = limitPaths.some(p => relPath.startsWith(p) || p.startsWith(relPath));
                    if (!inScope) continue;
                }
                await walkAndScan(fullPath, workspacePath, tagRegex, results, maxResults, limitPaths);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

                // Check paths filter
                if (limitPaths && limitPaths.length > 0) {
                    const inScope = limitPaths.some(p => relPath.startsWith(p));
                    if (!inScope) continue;
                }

                try {
                    const stat = await fs.stat(fullPath);
                    if (stat.size > MAX_FILE_SIZE) continue;

                    const content = await fs.readFile(fullPath, 'utf-8');
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                        const match = tagRegex.exec(lines[i]);
                        if (match) {
                            const tag = match[1].toUpperCase();
                            const text = lines[i].substring(match.index + match[0].length).trim()
                                || lines[i].trim();
                            results.push({
                                file: relPath,
                                line: i + 1,
                                tag,
                                text: text.length > 200 ? text.substring(0, 200) + '...' : text,
                            });
                        }
                    }
                } catch {
                    // Skip files that can't be read
                }
            }
        }
    } catch {
        // Skip directories that can't be read
    }
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleFindTodos(
    args: FindTodosArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    const tags = args.tags && args.tags.length > 0 ? args.tags.map(t => t.toUpperCase()) : DEFAULT_TAGS;
    const maxResults = Math.min(args.max_results || 100, 500);
    const workspacePath = serviceClient.getWorkspacePath();

    // Build regex: matches // TODO:, # FIXME:, /* HACK, etc.
    const tagPattern = tags.join('|');
    const tagRegex = new RegExp(`\\b(${tagPattern})\\b[:\\s]?`, 'i');

    const results: TodoItem[] = [];
    await walkAndScan(workspacePath, workspacePath, tagRegex, results, maxResults, args.paths);

    if (results.length === 0) {
        return `# 📋 TODO Tracker\n\n**Tags:** ${tags.join(', ')}\n\n_No items found. Your codebase is clean!_ 🎉\n`;
    }

    // Group by tag
    const byTag = new Map<string, TodoItem[]>();
    for (const item of results) {
        if (!byTag.has(item.tag)) byTag.set(item.tag, []);
        byTag.get(item.tag)!.push(item);
    }

    let output = `# 📋 TODO Tracker\n\n`;
    output += `**Found:** ${results.length} items across ${new Set(results.map(r => r.file)).size} files\n\n`;

    // Summary table
    output += `| Tag | Count |\n|-----|-------|\n`;
    for (const [tag, items] of byTag) {
        output += `| ${tag} | ${items.length} |\n`;
    }
    output += `\n`;

    // Details by tag
    for (const [tag, items] of byTag) {
        output += `## ${tag} (${items.length})\n\n`;
        for (const item of items) {
            output += `- **\`${item.file}:${item.line}\`** — ${item.text}\n`;
        }
        output += `\n`;
    }

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const findTodosTool = {
    name: 'find_todos',
    description: `Scan the workspace for TODO, FIXME, HACK, XXX, NOTE, BUG, and DEPRECATED comments.

Returns items grouped by tag with file paths and line numbers.

Use this tool when you need to:
- Find all outstanding work items in a codebase
- Audit technical debt markers
- Review code quality annotations
- Track known bugs and deprecations`,
    inputSchema: {
        type: 'object',
        properties: {
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter to specific tags (e.g., ["TODO", "FIXME"]). Default: all tags.',
            },
            max_results: {
                type: 'number',
                description: 'Maximum items to return (default: 100, max: 500)',
                default: 100,
            },
            paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Limit search to specific subdirectories (e.g., ["src", "lib"])',
            },
        },
        required: [],
    },
};
