import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SecurityScanner } from '../../security/scanner.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export const scanSecurityTool: Tool = {
    name: 'scan_security',
    description: 'Scan the workspace or specific files for security issues like secrets and dangerous code.',
    inputSchema: {
        type: 'object',
        properties: {
            targetPath: {
                type: 'string',
                description: 'Relative path to a file or directory to scan. Defaults to workspace root.',
            },
        },
    },
};

export async function handleScanSecurity(args: any, workspacePath: string): Promise<string> {
    const scanner = new SecurityScanner();
    const relativePath = args.targetPath || '.';
    const target = path.join(workspacePath, relativePath);

    try {
        const stats = await fs.stat(target);
        if (stats.isFile()) {
            const issues = await scanner.scanFile(target);
            if (issues.length === 0) return '✅ No security issues found in file.';
            return JSON.stringify(issues, null, 2);
        } else if (stats.isDirectory()) {
            // Deep scan not fully implemented in this simplified version, just scanning root files or specific file
            // For now, let's just say we only support single file scanning correctly in this iteration
            // or implement a simple readdir.
            return '⚠️ Directory scanning is limited. Please specify a file path for accurate results.';
        }
    } catch (err) {
        return `Error scanning path: ${err}`;
    }
    return 'Invalid path';
}
