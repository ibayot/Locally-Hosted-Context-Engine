/**
 * GitHub integration MCP tools
 */

import { GitHubConnector, parseGitHubUrl } from '../../integrations/github.js';
import { z } from 'zod';
import { log } from '../../utils/logger.js';
import { execSync } from 'child_process';

// Schemas
export const GetGitHubIssuesSchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  limit: z.number().int().min(1).max(100).optional().default(30),
}).strict();

export const GetGitHubIssueSchema = z.object({
  number: z.number().int().min(1),
}).strict();

export const SearchGitHubIssuesSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(20),
}).strict();

export const GetGitHubPRsSchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  limit: z.number().int().min(1).max(100).optional().default(30),
}).strict();

let githubConnector: GitHubConnector | null = null;

function getConnector(workspacePath: string): GitHubConnector | null {
  if (githubConnector) {
    return githubConnector;
  }

  try {
    // Try to get remote URL from git
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd: workspacePath,
      encoding: 'utf-8',
    }).trim();

    const parsed = parseGitHubUrl(remoteUrl);
    if (!parsed) {
      log.warn('Could not parse GitHub URL from git remote');
      return null;
    }

    githubConnector = new GitHubConnector({
      owner: parsed.owner,
      repo: parsed.repo,
      token: process.env.GITHUB_TOKEN,
    });

    return githubConnector;
  } catch (error) {
    log.error('Failed to initialize GitHub connector', { error: String(error) });
    return null;
  }
}

export async function handleGetGitHubIssues(
  args: z.infer<typeof GetGitHubIssuesSchema>,
  workspacePath: string
): Promise<string> {
  const connector = getConnector(workspacePath);
  if (!connector) {
    return 'GitHub integration not available. Ensure workspace has a GitHub remote and optionally set GITHUB_TOKEN env var.';
  }

  const issues = await connector.getIssues(args.state, args.limit);
  
  if (issues.length === 0) {
    return `No ${args.state} issues found.`;
  }

  const formatted = issues.map(issue => {
    const labels = issue.labels.length > 0 ? `[${issue.labels.join(', ')}]` : '';
    return `#${issue.number} ${labels} ${issue.title}\n   State: ${issue.state} | Created: ${new Date(issue.createdAt).toLocaleDateString()}\n   ${issue.body.slice(0, 200)}${issue.body.length > 200 ? '...' : ''}`;
  }).join('\n\n');

  return `Found ${issues.length} ${args.state} issues:\n\n${formatted}`;
}

export async function handleGetGitHubIssue(
  args: z.infer<typeof GetGitHubIssueSchema>,
  workspacePath: string
): Promise<string> {
  const connector = getConnector(workspacePath);
  if (!connector) {
    return 'GitHub integration not available.';
  }

  const issue = await connector.getIssue(args.number);
  
  if (!issue) {
    return `Issue #${args.number} not found.`;
  }

  const labels = issue.labels.length > 0 ? `Labels: ${issue.labels.join(', ')}\n` : '';
  
  return `# Issue #${issue.number}: ${issue.title}

State: ${issue.state}
${labels}Created: ${new Date(issue.createdAt).toLocaleString()}
Updated: ${new Date(issue.updatedAt).toLocaleString()}

## Description

${issue.body}`;
}

export async function handleSearchGitHubIssues(
  args: z.infer<typeof SearchGitHubIssuesSchema>,
  workspacePath: string
): Promise<string> {
  const connector = getConnector(workspacePath);
  if (!connector) {
    return 'GitHub integration not available.';
  }

  const issues = await connector.searchIssues(args.query, args.limit);
  
  if (issues.length === 0) {
    return `No issues found matching: ${args.query}`;
  }

  const formatted = issues.map(issue => {
    const labels = issue.labels.length > 0 ? `[${issue.labels.join(', ')}]` : '';
    return `#${issue.number} ${labels} ${issue.title}\n   ${issue.body.slice(0, 150)}${issue.body.length > 150 ? '...' : ''}`;
  }).join('\n\n');

  return `Found ${issues.length} issues matching "${args.query}":\n\n${formatted}`;
}

export async function handleGetGitHubPRs(
  args: z.infer<typeof GetGitHubPRsSchema>,
  workspacePath: string
): Promise<string> {
  const connector = getConnector(workspacePath);
  if (!connector) {
    return 'GitHub integration not available.';
  }

  const prs = await connector.getPullRequests(args.state, args.limit);
  
  if (prs.length === 0) {
    return `No ${args.state} pull requests found.`;
  }

  const formatted = prs.map(pr => {
    const labels = pr.labels.length > 0 ? `[${pr.labels.join(', ')}]` : '';
    const changes = `+${pr.additions} -${pr.deletions} (${pr.changedFiles} files)`;
    return `#${pr.number} ${labels} ${pr.title}\n   ${changes} | State: ${pr.state}\n   ${pr.body.slice(0, 150)}${pr.body.length > 150 ? '...' : ''}`;
  }).join('\n\n');

  return `Found ${prs.length} ${args.state} pull requests:\n\n${formatted}`;
}

// Tool definitions for MCP
export const githubTools = [
  {
    name: 'get_github_issues',
    description: 'Retrieve GitHub issues from the repository (requires GitHub remote)',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by issue state',
          default: 'open',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of issues to retrieve',
          default: 30,
        },
      },
    },
  },
  {
    name: 'get_github_issue',
    description: 'Get details of a specific GitHub issue by number',
    inputSchema: {
      type: 'object',
      properties: {
        number: {
          type: 'number',
          description: 'Issue number',
        },
      },
      required: ['number'],
    },
  },
  {
    name: 'search_github_issues',
    description: 'Search GitHub issues using a query string',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (GitHub search syntax)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_github_prs',
    description: 'Retrieve GitHub pull requests from the repository',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by PR state',
          default: 'open',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of PRs to retrieve',
          default: 30,
        },
      },
    },
  },
];
