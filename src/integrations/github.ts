/**
 * GitHub API Integration
 * Free tier: 5000 requests/hour (authenticated) or 60/hour (unauthenticated)
 */

import { Octokit } from 'octokit';
import { log } from '../utils/logger.js';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GitHubPR extends GitHubIssue {
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: boolean | null;
}

export interface GitHubConfig {
  token?: string;
  owner: string;
  repo: string;
}

export class GitHubConnector {
  private octokit: Octokit;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.token });
    
    log.info('GitHub connector initialized', {
      authenticated: !!config.token,
      repo: `${config.owner}/${config.repo}`
    });
  }

  async getIssues(state: 'open' | 'closed' | 'all' = 'open', limit: number = 30): Promise<GitHubIssue[]> {
    try {
      const response = await this.octokit.rest.issues.listForRepo({
        owner: this.config.owner,
        repo: this.config.repo,
        state,
        per_page: limit,
      });

      return response.data.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state as 'open' | 'closed',
        labels: issue.labels.map((l: any) => typeof l === 'string' ? l : l.name || ''),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));
    } catch (error) {
      log.error('Failed to fetch GitHub issues', { error: String(error) });
      return [];
    }
  }

  async getIssue(number: number): Promise<GitHubIssue | null> {
    try {
      const response = await this.octokit.rest.issues.get({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: number,
      });

      return {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body || '',
        state: response.data.state as 'open' | 'closed',
        labels: response.data.labels.map((l: any) => typeof l === 'string' ? l : l.name || ''),
        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at,
      };
    } catch (error) {
      log.error('Failed to fetch GitHub issue', { number, error: String(error) });
      return null;
    }
  }

  async getPullRequests(state: 'open' | 'closed' | 'all' = 'open', limit: number = 30): Promise<GitHubPR[]> {
    try {
      const response = await this.octokit.rest.pulls.list({
        owner: this.config.owner,
        repo: this.config.repo,
        state,
        per_page: limit,
      });

      return response.data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state as 'open' | 'closed',
        labels: pr.labels.map((l: any) => typeof l === 'string' ? l : l.name || ''),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFiles: pr.changed_files || 0,
        mergeable: pr.mergeable,
      }));
    } catch (error) {
      log.error('Failed to fetch GitHub PRs', { error: String(error) });
      return [];
    }
  }

  async searchIssues(query: string, limit: number = 20): Promise<GitHubIssue[]> {
    try {
      const response = await this.octokit.rest.search.issuesAndPullRequests({
        q: `${query} repo:${this.config.owner}/${this.config.repo}`,
        per_page: limit,
      });

      return response.data.items.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state as 'open' | 'closed',
        labels: issue.labels?.map((l: any) => typeof l === 'string' ? l : l.name || '') || [],
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }));
    } catch (error) {
      log.error('Failed to search GitHub issues', { query, error: String(error) });
      return [];
    }
  }

  async getFileContent(path: string, ref: string = 'main'): Promise<string | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path,
        ref,
      });

      if ('content' in response.data) {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch (error) {
      log.error('Failed to fetch file content', { path, error: String(error) });
      return null;
    }
  }

  async getRateLimit() {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      return {
        limit: response.data.rate.limit,
        remaining: response.data.rate.remaining,
        reset: new Date(response.data.rate.reset * 1000),
      };
    } catch (error) {
      log.error('Failed to check rate limit', { error: String(error) });
      return null;
    }
  }
}

/**
 * Helper to extract owner/repo from git remote URL
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Supports:
  // - https://github.com/owner/repo.git
  // - git@github.com:owner/repo.git
  // - https://github.com/owner/repo
  const patterns = [
    /github\.com[:/]([^/]+)\/([^/.]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
  }

  return null;
}
