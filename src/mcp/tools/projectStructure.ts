/**
 * Layer 3: MCP Interface Layer - Project Structure Tool
 *
 * Generates a directory tree visualization of the workspace
 * with metadata (file count, sizes).
 *
 * Fully local, deterministic — no LLM required.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface ProjectStructureArgs {
    max_depth?: number;       // Max depth to display (default: 4)
    show_files?: boolean;     // Show individual files (default: true)
    show_hidden?: boolean;    // Show hidden dirs/files (default: false)
}

// ============================================================================
// Constants
// ============================================================================

const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'build', '.git', '.next', '__pycache__',
    'vendor', '.dart_tool', 'Pods', '.pub-cache', 'coverage',
    '.local-context', '.memories', '.augment-context-state.json',
]);

const MAX_ENTRIES_PER_DIR = 50; // Prevent overwhelming output

// ============================================================================
// Implementation
// ============================================================================

interface TreeNode {
    name: string;
    isDir: boolean;
    children?: TreeNode[];
    size?: number;
    childCount?: number;
}

async function buildTree(
    dir: string,
    currentDepth: number,
    maxDepth: number,
    showFiles: boolean,
    showHidden: boolean,
): Promise<TreeNode[]> {
    if (currentDepth >= maxDepth) return [];

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        // Sort: directories first, then files, both alphabetical
        const sorted = entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        const nodes: TreeNode[] = [];

        for (const entry of sorted.slice(0, MAX_ENTRIES_PER_DIR)) {
            // Skip hidden unless requested
            if (!showHidden && entry.name.startsWith('.')) continue;

            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);
                const children = await buildTree(fullPath, currentDepth + 1, maxDepth, showFiles, showHidden);

                // Count total children recursively
                let childCount = 0;
                try {
                    const subEntries = await fs.readdir(fullPath);
                    childCount = subEntries.length;
                } catch { /* ignore */ }

                nodes.push({
                    name: entry.name,
                    isDir: true,
                    children,
                    childCount,
                });
            } else if (showFiles) {
                try {
                    const fullPath = path.join(dir, entry.name);
                    const stat = await fs.stat(fullPath);
                    nodes.push({
                        name: entry.name,
                        isDir: false,
                        size: stat.size,
                    });
                } catch {
                    nodes.push({ name: entry.name, isDir: false });
                }
            }
        }

        if (sorted.length > MAX_ENTRIES_PER_DIR) {
            nodes.push({
                name: `... and ${sorted.length - MAX_ENTRIES_PER_DIR} more entries`,
                isDir: false,
            });
        }

        return nodes;
    } catch {
        return [];
    }
}

function renderTree(nodes: TreeNode[], prefix: string = ''): string {
    let output = '';

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        if (node.isDir) {
            const countStr = node.childCount !== undefined ? ` (${node.childCount} items)` : '';
            output += `${prefix}${connector}📁 ${node.name}/${countStr}\n`;
            if (node.children && node.children.length > 0) {
                output += renderTree(node.children, prefix + childPrefix);
            }
        } else {
            const sizeStr = node.size !== undefined ? ` (${formatBytes(node.size)})` : '';
            output += `${prefix}${connector}${node.name}${sizeStr}\n`;
        }
    }

    return output;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleProjectStructure(
    args: ProjectStructureArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    const maxDepth = Math.min(args.max_depth || 4, 8);
    const showFiles = args.show_files !== false;
    const showHidden = args.show_hidden === true;
    const workspacePath = serviceClient.getWorkspacePath();
    const rootName = path.basename(workspacePath);

    const tree = await buildTree(workspacePath, 0, maxDepth, showFiles, showHidden);

    let output = `# 🏗️ Project Structure\n\n`;
    output += `**Root:** \`${rootName}/\`\n`;
    output += `**Depth:** ${maxDepth} levels\n\n`;
    output += '```\n';
    output += `${rootName}/\n`;
    output += renderTree(tree);
    output += '```\n';

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const projectStructureTool = {
    name: 'project_structure',
    description: `Generate a directory tree visualization of the workspace with file sizes and item counts.

Use this tool when you need to:
- Understand the overall project layout
- Explore the directory structure before diving into code
- Get a bird's-eye view of the codebase organization
- Identify where different features or components are located`,
    inputSchema: {
        type: 'object',
        properties: {
            max_depth: {
                type: 'number',
                description: 'Maximum directory depth to display (default: 4, max: 8)',
                default: 4,
            },
            show_files: {
                type: 'boolean',
                description: 'Show individual files, not just directories (default: true)',
                default: true,
            },
            show_hidden: {
                type: 'boolean',
                description: 'Show hidden files/directories starting with dot (default: false)',
                default: false,
            },
        },
        required: [],
    },
};
