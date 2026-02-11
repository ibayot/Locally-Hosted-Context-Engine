/**
 * Layer 3: MCP Interface Layer - Git Context Tool
 *
 * Provides git-based context: recent commits, blame info,
 * changed files summary, and diff stats.
 *
 * Shells out to local `git` CLI — fully offline, no LLM required.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { ContextServiceClient } from '../serviceClient.js';

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

export interface GitContextArgs {
    action: 'log' | 'blame' | 'diff_stat' | 'status' | 'contributors';
    file?: string;          // Required for blame
    count?: number;         // Number of log entries (default: 10)
    branch?: string;        // Branch for diff_stat (default: current vs HEAD~1)
}

// ============================================================================
// Helpers
// ============================================================================

async function runGit(args: string[], cwd: string): Promise<string> {
    try {
        const { stdout } = await execFileAsync('git', args, {
            cwd,
            maxBuffer: 1024 * 1024, // 1MB
            timeout: 15000, // 15s
        });
        return stdout.trim();
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error('Git is not installed or not in PATH. Please install git.');
        }
        throw new Error(`Git command failed: ${error.message}`);
    }
}

async function isGitRepo(cwd: string): Promise<boolean> {
    try {
        await runGit(['rev-parse', '--is-inside-work-tree'], cwd);
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handleLog(cwd: string, count: number): Promise<string> {
    const raw = await runGit([
        'log',
        `--max-count=${count}`,
        '--pretty=format:%h|%an|%ar|%s',
        '--no-merges',
    ], cwd);

    if (!raw) return '_No commits found._\n';

    const lines = raw.split('\n');
    let output = `## 📜 Recent Commits (${lines.length})\n\n`;
    output += `| Hash | Author | When | Message |\n`;
    output += `|------|--------|------|---------|\n`;

    for (const line of lines) {
        const [hash, author, when, ...msgParts] = line.split('|');
        const message = msgParts.join('|'); // In case message contains |
        output += `| \`${hash}\` | ${author} | ${when} | ${message} |\n`;
    }

    return output + '\n';
}

async function handleBlame(cwd: string, file: string): Promise<string> {
    const raw = await runGit([
        'blame',
        '--line-porcelain',
        file,
    ], cwd);

    // Parse porcelain blame output
    const blocks: { line: number; author: string; date: string; content: string }[] = [];
    const lines = raw.split('\n');
    let currentAuthor = '';
    let currentDate = '';
    let lineNum = 0;

    for (const line of lines) {
        if (line.startsWith('author ')) {
            currentAuthor = line.substring(7);
        } else if (line.startsWith('author-time ')) {
            const timestamp = parseInt(line.substring(12), 10);
            currentDate = new Date(timestamp * 1000).toISOString().split('T')[0];
        } else if (line.startsWith('\t')) {
            lineNum++;
            blocks.push({
                line: lineNum,
                author: currentAuthor,
                date: currentDate,
                content: line.substring(1),
            });
        }
    }

    // Summarize by author
    const authorLines = new Map<string, number>();
    for (const b of blocks) {
        authorLines.set(b.author, (authorLines.get(b.author) || 0) + 1);
    }

    let output = `## 🔍 Blame: \`${file}\`\n\n`;
    output += `**Total lines:** ${blocks.length}\n\n`;
    output += `### Ownership Summary\n\n`;
    output += `| Author | Lines | % |\n|--------|-------|---|\n`;

    const sorted = [...authorLines.entries()].sort((a, b) => b[1] - a[1]);
    for (const [author, count] of sorted) {
        const pct = ((count / blocks.length) * 100).toFixed(1);
        output += `| ${author} | ${count} | ${pct}% |\n`;
    }

    // Show first 30 lines as sample
    output += `\n### Sample (first 30 lines)\n\n`;
    output += `| Line | Author | Date | Content |\n`;
    output += `|------|--------|------|---------|\n`;
    for (const b of blocks.slice(0, 30)) {
        const content = b.content.length > 60 ? b.content.substring(0, 60) + '...' : b.content;
        output += `| ${b.line} | ${b.author} | ${b.date} | \`${content}\` |\n`;
    }

    return output + '\n';
}

async function handleDiffStat(cwd: string, branch?: string): Promise<string> {
    const ref = branch || 'HEAD~1';
    const raw = await runGit(['diff', '--stat', ref], cwd);

    if (!raw) return '_No changes detected._\n';

    let output = `## 📊 Diff Stats (vs \`${ref}\`)\n\n`;
    output += '```\n';
    output += raw;
    output += '\n```\n';

    return output;
}

async function handleStatus(cwd: string): Promise<string> {
    const raw = await runGit(['status', '--porcelain', '--branch'], cwd);

    if (!raw) return '_Working tree is clean._\n';

    const lines = raw.split('\n');
    const branchLine = lines[0]; // ## main...origin/main
    const changes = lines.slice(1).filter(l => l.length > 0);

    let output = `## 📋 Git Status\n\n`;
    output += `**Branch:** \`${branchLine.replace('## ', '')}\`\n\n`;

    if (changes.length === 0) {
        output += '_Working tree is clean._\n';
        return output;
    }

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of changes) {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        if (status.startsWith('A') || status.startsWith('M') || status.startsWith('D') || status.startsWith('R')) {
            if (status[0] !== ' ' && status[0] !== '?') staged.push(`${status[0]} ${file}`);
            if (status[1] !== ' ' && status[1] !== '?') modified.push(`${status[1]} ${file}`);
        } else if (status === '??') {
            untracked.push(file);
        }
    }

    if (staged.length > 0) {
        output += `### Staged (${staged.length})\n`;
        for (const s of staged) output += `- \`${s}\`\n`;
        output += '\n';
    }

    if (modified.length > 0) {
        output += `### Modified (${modified.length})\n`;
        for (const m of modified) output += `- \`${m}\`\n`;
        output += '\n';
    }

    if (untracked.length > 0) {
        output += `### Untracked (${untracked.length})\n`;
        for (const u of untracked.slice(0, 20)) output += `- \`${u}\`\n`;
        if (untracked.length > 20) output += `- _...and ${untracked.length - 20} more_\n`;
        output += '\n';
    }

    return output;
}

async function handleContributors(cwd: string): Promise<string> {
    const raw = await runGit([
        'shortlog', '-sn', '--all', '--no-merges',
    ], cwd);

    if (!raw) return '_No contributors found._\n';

    const lines = raw.split('\n').filter(l => l.trim());
    let output = `## 👥 Contributors\n\n`;
    output += `| # | Author | Commits |\n`;
    output += `|---|--------|--------|\n`;

    lines.forEach((line, i) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (match) {
            output += `| ${i + 1} | ${match[2]} | ${match[1]} |\n`;
        }
    });

    return output + '\n';
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleGitContext(
    args: GitContextArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    const workspacePath = serviceClient.getWorkspacePath();

    if (!(await isGitRepo(workspacePath))) {
        return `# ⚠️ Git Context\n\nThis workspace is not a git repository. Initialize with \`git init\` to use git context features.\n`;
    }

    let output = `# 🔧 Git Context\n\n`;

    switch (args.action) {
        case 'log':
            output += await handleLog(workspacePath, Math.min(args.count || 10, 50));
            break;
        case 'blame':
            if (!args.file) throw new Error('File path is required for blame action');
            output += await handleBlame(workspacePath, args.file);
            break;
        case 'diff_stat':
            output += await handleDiffStat(workspacePath, args.branch);
            break;
        case 'status':
            output += await handleStatus(workspacePath);
            break;
        case 'contributors':
            output += await handleContributors(workspacePath);
            break;
        default:
            throw new Error(`Unknown action: ${args.action}. Valid actions: log, blame, diff_stat, status, contributors`);
    }

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const gitContextTool = {
    name: 'git_context',
    description: `Get git repository context: recent commits, file blame/ownership, diff stats, working tree status, and contributor summary.

Actions:
- **log**: Show recent commits (default: 10)
- **blame**: Show line-by-line ownership of a file
- **diff_stat**: Show files changed vs a branch or commit
- **status**: Show current working tree status (staged, modified, untracked)
- **contributors**: Show all contributors ranked by commit count

Uses the local git CLI — works fully offline.`,
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['log', 'blame', 'diff_stat', 'status', 'contributors'],
                description: 'The git action to perform',
            },
            file: {
                type: 'string',
                description: 'File path (required for blame action)',
            },
            count: {
                type: 'number',
                description: 'Number of log entries to show (default: 10, max: 50)',
                default: 10,
            },
            branch: {
                type: 'string',
                description: 'Branch or commit ref for diff_stat (default: HEAD~1)',
            },
        },
        required: ['action'],
    },
};
