/**
 * Context Engine VS Code Extension
 * 
 * Main entry point for the extension.
 */

import * as vscode from 'vscode';
import { ContextEngineClient } from './client';
import {
    StatusBarProvider,
    StatusTreeProvider,
    SearchResultsTreeProvider,
    RecentSearchesTreeProvider,
    OutputChannelManager,
    ContextEngineCodeLensProvider,
    HealthMonitor,
    ServerManager,
    ChatPanelProvider
} from './providers';
import { registerCommands, connectToServer, CommandContext } from './commands';

let client: ContextEngineClient;
let statusBar: StatusBarProvider;
let statusTree: StatusTreeProvider;
let searchResults: SearchResultsTreeProvider;
let recentSearches: RecentSearchesTreeProvider;
let output: OutputChannelManager;
let codeLensProvider: ContextEngineCodeLensProvider;
let healthMonitor: HealthMonitor;
let serverManager: ServerManager;
let chatPanel: ChatPanelProvider;

/**
 * Extension activation.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Context Engine extension activating...');

    const config = vscode.workspace.getConfiguration('contextEngine');

    // Create output channel first (used by other components)
    output = new OutputChannelManager();
    context.subscriptions.push(output);

    // Create client
    client = new ContextEngineClient();

    // Create status bar
    statusBar = new StatusBarProvider(client);
    context.subscriptions.push(statusBar);

    // Create tree providers
    statusTree = new StatusTreeProvider(client);
    searchResults = new SearchResultsTreeProvider();

    const maxRecentSearches = config.get<number>('maxRecentSearches', 10);
    recentSearches = new RecentSearchesTreeProvider(maxRecentSearches);

    // Register tree views
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('contextEngine.status', statusTree)
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('contextEngine.searchResults', searchResults)
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('contextEngine.recentSearches', recentSearches)
    );

    // Create and register chat panel
    chatPanel = new ChatPanelProvider(context.extensionUri, client, output);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewType, chatPanel)
    );

	    // Create CodeLens provider
	    codeLensProvider = new ContextEngineCodeLensProvider(client);
	    const enableCodeLens = config.get<boolean>('enableCodeLens', true);
	    codeLensProvider.setEnabled(enableCodeLens);

	    // Refresh CodeLens when connection status changes so that
	    // already-open editors get lenses once the user connects.
	    context.subscriptions.push(
	        client.onDidChangeConnection(() => {
	            codeLensProvider.refresh();
	        })
	    );

	    // Register CodeLens for supported languages
	    const supportedLanguages = [
	        'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
	        'python', 'go', 'rust', 'java', 'kotlin', 'csharp', 'dart'
	    ];

	    for (const language of supportedLanguages) {
	        context.subscriptions.push(
	            vscode.languages.registerCodeLensProvider(
	                { language, scheme: 'file' },
	                codeLensProvider
	            )
	        );
	    }

    // Create server manager
    serverManager = new ServerManager(output);
    context.subscriptions.push(serverManager);

    // Create health monitor
    const healthCheckInterval = config.get<number>('healthCheckInterval', 30000);
    healthMonitor = new HealthMonitor(
        client, statusBar, statusTree, output,
        { checkInterval: healthCheckInterval }
    );
    context.subscriptions.push(healthMonitor);

    // Create command context
    const ctx: CommandContext = {
        client,
        statusBar,
        statusTree,
        searchResults,
        recentSearches,
        output,
    };

    // Register commands
    registerCommands(context, ctx);

    // Register advanced commands
    registerAdvancedCommands(context, ctx);

    // Auto-start server if configured
    const autoStartServer = config.get<boolean>('autoStartServer', false);
    if (autoStartServer) {
        try {
            output.log('Auto-starting server...');
            await serverManager.start();
            client.setServerUrl(serverManager.getServerUrl());
        } catch (error) {
            output.error('Failed to auto-start server', error instanceof Error ? error : undefined);
        }
    }

    // Auto-connect if configured
    const autoConnect = config.get<boolean>('autoConnect', true);
    if (autoConnect) {
        connectInBackground(ctx);
    }

    // Start health monitoring if configured
    const enableHealthMonitoring = config.get<boolean>('enableHealthMonitoring', true);
    if (enableHealthMonitoring) {
        healthMonitor.start();
    }

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('contextEngine.serverUrl')) {
                const newUrl = vscode.workspace
                    .getConfiguration('contextEngine')
                    .get<string>('serverUrl');
                if (newUrl) {
                    client.setServerUrl(newUrl);
                    statusBar.update();
                    statusTree.refresh();
                }
            }
            if (e.affectsConfiguration('contextEngine.showStatusBar')) {
                statusBar.update();
            }
            if (e.affectsConfiguration('contextEngine.enableCodeLens')) {
                const enabled = vscode.workspace
                    .getConfiguration('contextEngine')
                    .get<boolean>('enableCodeLens', true);
                codeLensProvider.setEnabled(enabled);
            }
            if (e.affectsConfiguration('contextEngine.enableHealthMonitoring')) {
                const enabled = vscode.workspace
                    .getConfiguration('contextEngine')
                    .get<boolean>('enableHealthMonitoring', true);
                if (enabled) {
                    healthMonitor.start();
                } else {
                    healthMonitor.stop();
                }
            }
        })
    );

    output.log('Context Engine extension activated');
    console.log('Context Engine extension activated');
}

/**
 * Convert VS Code CancellationToken to AbortSignal for HTTP request cancellation.
 */
function tokenToAbortSignal(token: vscode.CancellationToken): AbortSignal {
    const controller = new AbortController();
    if (token.isCancellationRequested) {
        controller.abort();
    } else {
        token.onCancellationRequested(() => controller.abort());
    }
    return controller.signal;
}

/**
 * Register advanced feature commands.
 */
function registerAdvancedCommands(
    context: vscode.ExtensionContext,
    ctx: CommandContext
): void {
    // CodeLens: Search from definition
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'contextEngine.searchFromCodeLens',
            async (name: string, uri: vscode.Uri) => {
                if (!ctx.client.isConnected()) {
                    vscode.window.showWarningMessage('Not connected to Context Engine. Please connect first.');
                    return;
                }

                const query = `${name} usage and implementation`;

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Searching for "${name}"...`,
                        cancellable: true,
                    },
                    async (progress, token) => {
                        // Create AbortSignal from cancellation token
                        const abortSignal = tokenToAbortSignal(token);

                        try {
                            progress.report({ message: 'Querying codebase...' });
                            const response = await ctx.client.search(query, 10, abortSignal);

                            if (token.isCancellationRequested) {
                                vscode.window.showInformationMessage('Search cancelled');
                                return;
                            }

                            ctx.searchResults.setResults(response.results, query);
                            ctx.recentSearches.addSearch(query, response.results.length);
                            ctx.output.logSearchResults(query, response.results);

                            if (response.results.length > 0) {
                                vscode.commands.executeCommand('contextEngine.searchResults.focus');
                                vscode.window.showInformationMessage(`Found ${response.results.length} results for "${name}"`);
                            } else {
                                vscode.window.showInformationMessage(`No related code found for "${name}"`);
                            }
                        } catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            ctx.output.error('CodeLens search failed', error instanceof Error ? error : undefined);

                            // Don't show error if cancelled
                            if (!message.includes('cancelled') && !message.includes('abort')) {
                                vscode.window.showErrorMessage(`Search failed: ${message}`);
                            }
                        }
                    }
                );
            }
        )
    );

    // CodeLens: Get context for definition
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'contextEngine.getContextFromCodeLens',
            async (name: string, uri: vscode.Uri) => {
                if (!ctx.client.isConnected()) {
                    vscode.window.showWarningMessage('Not connected to Context Engine. Please connect first.');
                    return;
                }

                const query = `Explain ${name} and its purpose`;

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Getting context for "${name}"...`,
                        cancellable: true,
                    },
                    async (progress, token) => {
                        // Create AbortSignal from cancellation token
                        const abortSignal = tokenToAbortSignal(token);

                        try {
                            progress.report({ message: 'Analyzing codebase...' });
                            const response = await ctx.client.enhancePrompt(query, abortSignal);

                            if (token.isCancellationRequested) {
                                vscode.window.showInformationMessage('Context retrieval cancelled');
                                return;
                            }

                            const doc = await vscode.workspace.openTextDocument({
                                content: `# Context for ${name}\n\n${response.enhanced}`,
                                language: 'markdown',
                            });
                            await vscode.window.showTextDocument(doc, { preview: true });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            ctx.output.error('CodeLens context failed', error instanceof Error ? error : undefined);

                            // Don't show error if cancelled
                            if (!message.includes('cancelled') && !message.includes('abort')) {
                                vscode.window.showErrorMessage(`Context retrieval failed: ${message}`);
                            }
                        }
                    }
                );
            }
        )
    );

    // Start server
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.startServer', async () => {
            try {
                await serverManager.start();
                ctx.client.setServerUrl(serverManager.getServerUrl());
                await connectToServer(ctx);
                vscode.window.showInformationMessage('Context Engine server started');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to start server: ${message}`);
            }
        })
    );

    // Stop server
    context.subscriptions.push(
        vscode.commands.registerCommand('contextEngine.stopServer', async () => {
            try {
                ctx.client.disconnect();
                await serverManager.stop();
                ctx.statusBar.update();
                await ctx.statusTree.refresh();
                vscode.window.showInformationMessage('Context Engine server stopped');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to stop server: ${message}`);
            }
        })
    );
}

/**
 * Connect to server in background.
 */
async function connectInBackground(ctx: CommandContext): Promise<void> {
    try {
        ctx.statusBar.showConnecting();
        await ctx.client.connect();
        ctx.statusBar.update();
        await ctx.statusTree.refresh();
        ctx.output.logConnection(true, ctx.client.getServerUrl(), ctx.client.getVersion());
    } catch (error) {
        // Silently fail on auto-connect
        console.error('Auto-connect failed:', error);
        ctx.statusBar.update();
        ctx.output.error('Auto-connect failed', error instanceof Error ? error : undefined);
    }
}

/**
 * Extension deactivation.
 */
export function deactivate(): void {
    console.log('Context Engine extension deactivating...');
    output?.log('Extension deactivating');
    healthMonitor?.stop();
    client?.disconnect();
}
