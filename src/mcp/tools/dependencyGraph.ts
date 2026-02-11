/**
 * Layer 3: MCP Interface Layer - Dependency Graph Tool
 *
 * Analyzes import/export relationships to build a file dependency graph.
 * Shows what files import a given file and what it depends on.
 *
 * Uses the local AST parser — no LLM required.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getASTParser, ImportInfo } from '../../local/astParser.js';
import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface DependencyGraphArgs {
    file: string;           // File to analyze
    direction?: 'both' | 'imports' | 'dependents';  // Which direction (default: both)
    depth?: number;         // Max traversal depth (default: 2)
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

interface FileImports {
    relPath: string;
    imports: ImportInfo[];
}

async function collectAllImports(
    dir: string,
    workspacePath: string,
    parser: ReturnType<typeof getASTParser>,
    result: FileImports[]
): Promise<void> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await collectAllImports(fullPath, workspacePath, parser, result);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!PARSEABLE_EXTENSIONS.has(ext)) continue;

                try {
                    const stat = await fs.stat(fullPath);
                    if (stat.size > 500_000) continue;

                    const content = await fs.readFile(fullPath, 'utf-8');
                    const analysis = parser.analyze(fullPath, content);
                    const relPath = path.relative(workspacePath, fullPath).replace(/\\/g, '/');

                    result.push({ relPath, imports: analysis.imports });
                } catch {
                    // Skip unreadable files
                }
            }
        }
    } catch {
        // Skip unreadable directories
    }
}

/**
 * Resolve a relative import source to a workspace-relative path.
 * e.g., './utils' from 'src/index.ts' -> 'src/utils.ts'
 */
function resolveImportSource(importSource: string, fromFile: string): string | null {
    // Skip external modules (no leading dot)
    if (!importSource.startsWith('.')) return null;

    const fromDir = path.dirname(fromFile);
    let resolved = path.posix.join(fromDir, importSource);

    // Remove .js/.ts extensions and try common ones
    resolved = resolved.replace(/\.\w+$/, '');

    return resolved;
}

function normalizeRelPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/\.\w+$/, '');
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleDependencyGraph(
    args: DependencyGraphArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    if (!args.file || args.file.trim().length === 0) {
        throw new Error('File path is required');
    }

    const workspacePath = serviceClient.getWorkspacePath();
    const parser = getASTParser();
    const direction = args.direction || 'both';
    const maxDepth = Math.min(args.depth || 2, 5);

    // Collect imports from all files
    const allFiles: FileImports[] = [];
    await collectAllImports(workspacePath, workspacePath, parser, allFiles);

    const targetRelPath = args.file.replace(/\\/g, '/');
    const targetNorm = normalizeRelPath(targetRelPath);

    let output = `# 🔗 Dependency Graph: \`${targetRelPath}\`\n\n`;

    // Find what the target file imports
    if (direction === 'both' || direction === 'imports') {
        const targetFile = allFiles.find(f => normalizeRelPath(f.relPath) === targetNorm);

        output += `## 📥 Imports (what this file depends on)\n\n`;

        if (targetFile && targetFile.imports.length > 0) {
            const localImports = targetFile.imports.filter(i => i.source.startsWith('.'));
            const externalImports = targetFile.imports.filter(i => !i.source.startsWith('.'));

            if (localImports.length > 0) {
                output += `### Local Imports\n\n`;
                output += `| Source | Specifiers | Line |\n`;
                output += `|--------|-----------|------|\n`;
                for (const imp of localImports) {
                    const resolved = resolveImportSource(imp.source, targetRelPath) || imp.source;
                    output += `| \`${resolved}\` | ${imp.specifiers.join(', ')} | ${imp.line} |\n`;
                }
                output += `\n`;
            }

            if (externalImports.length > 0) {
                output += `### External Dependencies\n\n`;
                output += `| Package | Specifiers | Line |\n`;
                output += `|---------|-----------|------|\n`;
                for (const imp of externalImports) {
                    output += `| \`${imp.source}\` | ${imp.specifiers.join(', ')} | ${imp.line} |\n`;
                }
                output += `\n`;
            }
        } else {
            output += `_No imports found._\n\n`;
        }
    }

    // Find what depends on the target file (reverse dependencies)
    if (direction === 'both' || direction === 'dependents') {
        output += `## 📤 Dependents (what imports this file)\n\n`;

        const dependents: Array<{ file: string; specifiers: string[]; line: number }> = [];

        for (const file of allFiles) {
            for (const imp of file.imports) {
                const resolved = resolveImportSource(imp.source, file.relPath);
                if (resolved && normalizeRelPath(resolved) === targetNorm) {
                    dependents.push({
                        file: file.relPath,
                        specifiers: imp.specifiers,
                        line: imp.line,
                    });
                }
            }
        }

        if (dependents.length > 0) {
            output += `| File | Imports | Line |\n`;
            output += `|------|---------|------|\n`;
            for (const dep of dependents) {
                output += `| \`${dep.file}\` | ${dep.specifiers.join(', ')} | ${dep.line} |\n`;
            }
            output += `\n`;
        } else {
            output += `_No dependents found (this file is not imported by any other file)._\n\n`;
        }
    }

    // Summary
    output += `---\n\n`;
    output += `**Scanned:** ${allFiles.length} files\n`;

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const dependencyGraphTool = {
    name: 'dependency_graph',
    description: `Analyze file dependencies: show what a file imports and what other files depend on it.

Builds a dependency graph by parsing import/export statements across the workspace.

Use this tool when you need to:
- Understand what a file depends on (its imports)
- Find all files that import a specific file (reverse dependencies)
- Assess the impact of changing a file
- Identify tightly coupled modules`,
    inputSchema: {
        type: 'object',
        properties: {
            file: {
                type: 'string',
                description: 'Relative file path to analyze (e.g., "src/utils/auth.ts")',
            },
            direction: {
                type: 'string',
                enum: ['both', 'imports', 'dependents'],
                description: 'Which direction to analyze (default: both)',
                default: 'both',
            },
            depth: {
                type: 'number',
                description: 'Max traversal depth (default: 2, max: 5)',
                default: 2,
            },
        },
        required: ['file'],
    },
};
