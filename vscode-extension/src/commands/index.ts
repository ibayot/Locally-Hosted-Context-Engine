/**
 * Command Handlers
 * 
 * Implements all VS Code commands for the Context Engine extension.
 */

import * as vscode from 'vscode';
import { ContextEngineClient } from '../client';
import {
    StatusBarProvider,
    StatusTreeProvider,
    SearchResultsTreeProvider,
    RecentSearchesTreeProvider,
    OutputChannelManager
} from '../providers';

export interface CommandContext {
    client: ContextEngineClient;
    statusBar: StatusBarProvider;
    statusTree: StatusTreeProvider;
    searchResults: SearchResultsTreeProvider;
    recentSearches: RecentSearchesTreeProvider;
    output: OutputChannelManager;
}

/**
 * Register all extension commands.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    ctx: CommandContext
): void {
    const { client, statusBar, statusTree, searchResults, recentSearches, output } = ctx;

    // Connect to Server
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.connect', async () => {
            await connectToServer(ctx);
        })
    );

    // Disconnect from Server
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.disconnect', () => {
            client.disconnect();
            statusBar.update();
            statusTree.refresh();
            output.logConnection(false, client.getServerUrl());
            vscode.window.showInformationMessage('Disconnected from Context Engine server');
        })
    );

    // Show Index Status
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.showStatus', async () => {
            await showStatus(ctx);
        })
    );

    // Refresh Status (for tree view)
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.refreshStatus', async () => {
            await statusTree.refresh();
        })
    );

    // Index Workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.indexWorkspace', async () => {
            await indexWorkspace(ctx);
        })
    );

    // Semantic Search
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.search', async () => {
            await semanticSearch(ctx);
        })
    );

    // Re-run Search (from recent searches)
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.rerunSearch', async (query: string) => {
            await runSearch(ctx, query);
        })
    );

    // Clear Search Results
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.clearSearchResults', () => {
            searchResults.clear();
            vscode.window.showInformationMessage('Search results cleared');
        })
    );

    // Open Result (context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.openResult', async (item: any) => {
            if (item?.result?.path) {
                const uri = vscode.Uri.file(item.result.path);
                await vscode.window.showTextDocument(uri);
            }
        })
    );

    // Enhance Prompt
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.enhancePrompt', async () => {
            await enhancePrompt(ctx);
        })
    );

    // Show Output
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.showOutput', () => {
            output.show();
        })
    );

    // Create Plan
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.createPlan', async () => {
            await createPlan(ctx);
        })
    );

    // Codebase Retrieval
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.codebaseRetrieval', async () => {
            await codebaseRetrieval(ctx);
        })
    );
}

/**
 * Connect to the Context Engine server.
 */
export async function connectToServer(ctx: CommandContext): Promise<void> {
    const { client, statusBar, statusTree, output } = ctx;

    statusBar.showConnecting();

    try {
        const health = await client.connect();
        statusBar.update();
        await statusTree.refresh();
        output.logConnection(true, client.getServerUrl(), health.version);
        vscode.window.showInformationMessage(
            `Connected to Context Engine v${health.version}`
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        statusBar.showError(message);
        output.error('Connection failed', error instanceof Error ? error : undefined);

        const action = await vscode.window.showErrorMessage(
            `Failed to connect to Context Engine: ${message}`,
            'Retry',
            'Configure Server URL'
        );

        if (action === 'Retry') {
            await connectToServer(ctx);
        } else if (action === 'Configure Server URL') {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'contextEngine.serverUrl'
            );
        }
    }
}

/**
 * Show index status.
 */
async function showStatus(ctx: CommandContext): Promise<void> {
    const { client, statusBar, statusTree, output } = ctx;

    if (!client.isConnected()) {
        const action = await vscode.window.showWarningMessage(
            'Not connected to Context Engine server',
            'Connect'
        );
        if (action === 'Connect') {
            await connectToServer(ctx);
        }
        return;
    }

    try {
        const status = await client.getStatus();
        output.logIndexStatus(status);
        await statusTree.refresh();

        const items = [
            `Status: ${status.status}`,
            `Files: ${status.fileCount}`,
            `Last Indexed: ${status.lastIndexed || 'Never'}`,
        ];

        if (status.isStale) {
            items.push('⚠️ Index is stale');
        }

        const action = await vscode.window.showInformationMessage(
            items.join(' | '),
            'Index Now',
            'Show Output'
        );

        if (action === 'Index Now') {
            await indexWorkspace(ctx);
        } else if (action === 'Show Output') {
            output.show();
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.error('Failed to get status', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage(`Failed to get status: ${message}`);
    }
}

/**
 * Index the workspace.
 */
async function indexWorkspace(ctx: CommandContext): Promise<void> {
    const { client, statusBar, statusTree, output } = ctx;

    if (!client.isConnected()) {
        const action = await vscode.window.showWarningMessage(
            'Not connected to Context Engine server',
            'Connect'
        );
        if (action === 'Connect') {
            await connectToServer(ctx);
            if (!client.isConnected()) {
                return;
            }
        } else {
            return;
        }
    }

    output.log('Starting workspace indexing...');

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Context Engine: Indexing workspace...',
            cancellable: false,
        },
        async () => {
            try {
                const result = await client.indexWorkspace(false);
                await statusTree.refresh();

                if (result.success) {
                    output.log(`Indexing complete: ${result.indexed} files in ${result.duration}ms`);
                    vscode.window.showInformationMessage(
                        `Indexed ${result.indexed} files in ${result.duration}ms`
                    );
                } else {
                    output.log(`Indexing warning: ${result.message}`);
                    vscode.window.showWarningMessage(
                        result.message || 'Indexing completed with warnings'
                    );
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                output.error('Indexing failed', error instanceof Error ? error : undefined);
                vscode.window.showErrorMessage(`Indexing failed: ${message}`);
            }
        }
    );
}

/**
 * Perform semantic search.
 */
async function semanticSearch(ctx: CommandContext): Promise<void> {
    const { client, statusBar } = ctx;

    if (!client.isConnected()) {
        const action = await vscode.window.showWarningMessage(
            'Not connected to Context Engine server',
            'Connect'
        );
        if (action === 'Connect') {
            await connectToServer(ctx);
            if (!client.isConnected()) {
                return;
            }
        } else {
            return;
        }
    }

    const query = await vscode.window.showInputBox({
        prompt: 'Enter your search query',
        placeHolder: 'e.g., "authentication middleware" or "database connection"',
    });

    if (!query) {
        return;
    }

    await runSearch(ctx, query);
}

/**
 * Run a search with the given query.
 */
async function runSearch(ctx: CommandContext, query: string): Promise<void> {
    const { client, searchResults, recentSearches, output } = ctx;

    const config = vscode.workspace.getConfiguration('contextEngine');
    const maxResults = config.get<number>('maxSearchResults', 20);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Searching: "${query}"...`,
            cancellable: false,
        },
        async () => {
            try {
                const response = await client.search(query, maxResults);

                // Update tree views
                searchResults.setResults(response.results, query);
                recentSearches.addSearch(query, response.results.length);

                // Log to output
                output.logSearchResults(query, response.results);

                if (response.results.length === 0) {
                    vscode.window.showInformationMessage('No results found');
                } else {
                    vscode.window.showInformationMessage(
                        `Found ${response.results.length} results for "${query}"`
                    );
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                output.error('Search failed', error instanceof Error ? error : undefined);
                vscode.window.showErrorMessage(`Search failed: ${message}`);
            }
        }
    );
}

/**
 * Enhance a prompt.
 */
async function enhancePrompt(ctx: CommandContext): Promise<void> {
    const { client, output } = ctx;

    if (!client.isConnected()) {
        const action = await vscode.window.showWarningMessage(
            'Not connected to Context Engine server',
            'Connect'
        );
        if (action === 'Connect') {
            await connectToServer(ctx);
            if (!client.isConnected()) {
                return;
            }
        } else {
            return;
        }
    }

    // Get selected text or prompt for input
    const editor = vscode.window.activeTextEditor;
    let prompt = editor?.document.getText(editor.selection);

    if (!prompt) {
        prompt = await vscode.window.showInputBox({
            prompt: 'Enter the prompt to enhance',
            placeHolder: 'e.g., "fix the login bug"',
        });
    }

    if (!prompt) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Context Engine: Enhancing prompt...',
            cancellable: false,
        },
        async () => {
            try {
                const response = await client.enhancePrompt(prompt!);

                // Log to output
                output.logEnhancedPrompt(prompt!, response.enhanced);

                // Show enhanced prompt in a new document
                const doc = await vscode.workspace.openTextDocument({
                    content: response.enhanced,
                    language: 'markdown',
                });
                await vscode.window.showTextDocument(doc, { preview: true });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                output.error('Enhancement failed', error instanceof Error ? error : undefined);
                vscode.window.showErrorMessage(`Enhancement failed: ${message}`);
            }
        }
    );
}

/**
 * Create an implementation plan.
 */
async function createPlan(ctx: CommandContext): Promise<void> {
    const { client, output } = ctx;

    if (!client.isConnected()) {
        const action = await vscode.window.showWarningMessage(
            'Not connected to Context Engine server',
            'Connect'
        );
        if (action === 'Connect') {
            await connectToServer(ctx);
            if (!client.isConnected()) {
                return;
            }
        } else {
            return;
        }
    }

    const task = await vscode.window.showInputBox({
        prompt: 'Describe the task to create a plan for',
        placeHolder: 'e.g., "Add user authentication with JWT"',
    });

    if (!task) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Context Engine: Creating plan...',
            cancellable: false,
        },
        async () => {
            try {
                const response = await client.createPlan(task);

                output.log(`Plan created for: ${task}`);

                // Show plan in a new document
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Implementation Plan\n\n**Task:** ${task}\n\n${response.plan || JSON.stringify(response, null, 2)}`,
                    language: 'markdown',
                });
                await vscode.window.showTextDocument(doc, { preview: true });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                output.error('Plan creation failed', error instanceof Error ? error : undefined);
                vscode.window.showErrorMessage(`Plan creation failed: ${message}`);
            }
        }
    );
}

/**
 * Perform codebase retrieval.
 */
async function codebaseRetrieval(ctx: CommandContext): Promise<void> {
    const { client, searchResults, recentSearches, output } = ctx;

    if (!client.isConnected()) {
        const action = await vscode.window.showWarningMessage(
            'Not connected to Context Engine server',
            'Connect'
        );
        if (action === 'Connect') {
            await connectToServer(ctx);
            if (!client.isConnected()) {
                return;
            }
        } else {
            return;
        }
    }

    const query = await vscode.window.showInputBox({
        prompt: 'What code are you looking for?',
        placeHolder: 'e.g., "Where is user authentication handled?"',
    });

    if (!query) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Retrieving: "${query}"...`,
            cancellable: false,
        },
        async () => {
            try {
                const response = await client.codebaseRetrieval(query);

                // Update tree views with results
                if (response.results) {
                    searchResults.setResults(response.results, query);
                    recentSearches.addSearch(query, response.results.length);
                    output.logSearchResults(query, response.results);

                    if (response.results.length === 0) {
                        vscode.window.showInformationMessage('No results found');
                    } else {
                        vscode.window.showInformationMessage(
                            `Found ${response.results.length} results for "${query}"`
                        );
                    }
                } else {
                    // Show raw response if no structured results
                    const doc = await vscode.workspace.openTextDocument({
                        content: `# Codebase Retrieval\n\n**Query:** ${query}\n\n${JSON.stringify(response, null, 2)}`,
                        language: 'markdown',
                    });
                    await vscode.window.showTextDocument(doc, { preview: true });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                output.error('Retrieval failed', error instanceof Error ? error : undefined);
                vscode.window.showErrorMessage(`Retrieval failed: ${message}`);
            }
        }
    );
}
