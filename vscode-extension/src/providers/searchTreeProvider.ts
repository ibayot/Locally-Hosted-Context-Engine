/**
 * Search Results TreeView Provider
 * 
 * Displays semantic search results in the sidebar.
 */

import * as vscode from 'vscode';
import { SearchResult } from '../client';
import * as path from 'path';

export class SearchResultItem extends vscode.TreeItem {
    constructor(
        public readonly result: SearchResult,
        public readonly workspaceRoot: string
    ) {
        super(path.basename(result.path), vscode.TreeItemCollapsibleState.None);

        this.description = result.lines || '';
        this.tooltip = this.createTooltip();
        this.contextValue = 'searchResult';

        // Set icon based on file extension
        this.iconPath = vscode.ThemeIcon.File;

        // Make clickable to open file
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.file(this.getAbsolutePath())],
        };

        // Add resource URI for file icon
        this.resourceUri = vscode.Uri.file(this.getAbsolutePath());
    }

    private getAbsolutePath(): string {
        if (path.isAbsolute(this.result.path)) {
            return this.result.path;
        }
        return path.join(this.workspaceRoot, this.result.path);
    }

    private createTooltip(): vscode.MarkdownString {
        const score = this.result.relevanceScore || this.result.score || 0;
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${this.result.path}**\n\n`);
        md.appendMarkdown(`Score: ${(score * 100).toFixed(1)}%\n\n`);
        if (this.result.lines) {
            md.appendMarkdown(`Lines: ${this.result.lines}\n\n`);
        }
        if (this.result.content) {
            md.appendCodeblock(this.result.content.substring(0, 500), this.getLanguage());
        }
        return md;
    }

    private getLanguage(): string {
        const ext = path.extname(this.result.path).toLowerCase();
        const langMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescriptreact',
            '.js': 'javascript',
            '.jsx': 'javascriptreact',
            '.py': 'python',
            '.rs': 'rust',
            '.go': 'go',
            '.java': 'java',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.dart': 'dart',
            '.md': 'markdown',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
        };
        return langMap[ext] || 'plaintext';
    }
}

export class SearchQueryItem extends vscode.TreeItem {
    constructor(
        public readonly query: string,
        public readonly resultCount: number
    ) {
        super(query, vscode.TreeItemCollapsibleState.None);
        this.description = `${resultCount} results`;
        this.iconPath = new vscode.ThemeIcon('search');
        this.contextValue = 'searchQuery';

        // Click to re-run search
        this.command = {
            command: 'contextEngine.rerunSearch',
            title: 'Run Search',
            arguments: [query],
        };
    }
}

export class SearchResultsTreeProvider implements vscode.TreeDataProvider<SearchResultItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SearchResultItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private results: SearchResult[] = [];
    private query: string = '';
    private workspaceRoot: string;

    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.workspaceRoot = workspaceFolder?.uri.fsPath || '';
    }

    /**
     * Set search results.
     */
    setResults(results: SearchResult[], query: string): void {
        this.results = results;
        this.query = query;
        this._onDidChangeTreeData.fire();
    }

    /**
     * Clear search results.
     */
    clear(): void {
        this.results = [];
        this.query = '';
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get the current query.
     */
    getQuery(): string {
        return this.query;
    }

    /**
     * Get results count.
     */
    getResultCount(): number {
        return this.results.length;
    }

    /**
     * Get tree item for display.
     */
    getTreeItem(element: SearchResultItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of a tree item.
     */
    getChildren(element?: SearchResultItem): SearchResultItem[] {
        if (element) {
            return [];
        }

        return this.results.map(result => new SearchResultItem(result, this.workspaceRoot));
    }
}

export class RecentSearchesTreeProvider implements vscode.TreeDataProvider<SearchQueryItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SearchQueryItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private searches: Array<{ query: string; resultCount: number }> = [];
    private maxSearches: number;

    constructor(maxSearches: number = 10) {
        this.maxSearches = maxSearches;
    }

    /**
     * Add a recent search.
     */
    addSearch(query: string, resultCount: number): void {
        // Remove if already exists
        this.searches = this.searches.filter(s => s.query !== query);

        // Add to front
        this.searches.unshift({ query, resultCount });

        // Trim to max
        if (this.searches.length > this.maxSearches) {
            this.searches = this.searches.slice(0, this.maxSearches);
        }

        this._onDidChangeTreeData.fire();
    }

    /**
     * Clear recent searches.
     */
    clear(): void {
        this.searches = [];
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get tree item for display.
     */
    getTreeItem(element: SearchQueryItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of a tree item.
     */
    getChildren(element?: SearchQueryItem): SearchQueryItem[] {
        if (element) {
            return [];
        }

        return this.searches.map(s => new SearchQueryItem(s.query, s.resultCount));
    }
}
