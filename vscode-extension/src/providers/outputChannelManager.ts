/**
 * Output Channel Manager
 * 
 * Manages the output channel for logging and detailed results.
 */

import * as vscode from 'vscode';
import { SearchResult, IndexStatus } from '../client';

export class OutputChannelManager implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Context Engine');
    }

    /**
     * Show the output channel.
     */
    show(): void {
        this.outputChannel.show();
    }

    /**
     * Clear the output channel.
     */
    clear(): void {
        this.outputChannel.clear();
    }

    /**
     * Log a message.
     */
    log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Log an error.
     */
    error(message: string, error?: Error): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ERROR: ${message}`);
        if (error) {
            this.outputChannel.appendLine(`  ${error.message}`);
            if (error.stack) {
                this.outputChannel.appendLine(`  ${error.stack}`);
            }
        }
    }

    /**
     * Log connection status.
     */
    logConnection(connected: boolean, serverUrl: string, version?: string): void {
        if (connected) {
            this.log(`Connected to ${serverUrl} (v${version})`);
        } else {
            this.log(`Disconnected from ${serverUrl}`);
        }
    }

    /**
     * Log index status.
     */
    logIndexStatus(status: IndexStatus): void {
        this.log('=== Index Status ===');
        this.log(`  Workspace: ${status.workspace}`);
        this.log(`  Status: ${status.status}`);
        this.log(`  Files: ${status.fileCount}`);
        this.log(`  Last Indexed: ${status.lastIndexed || 'Never'}`);
        this.log(`  Stale: ${status.isStale}`);
        if (status.lastError) {
            this.log(`  Last Error: ${status.lastError}`);
        }
    }

    /**
     * Log search results.
     */
    logSearchResults(query: string, results: SearchResult[]): void {
        this.log(`=== Search: "${query}" ===`);
        this.log(`Found ${results.length} results`);
        this.log('');

        results.forEach((result, index) => {
            const score = result.relevanceScore || result.score || 0;
            this.log(`[${index + 1}] ${result.path}`);
            this.log(`    Score: ${(score * 100).toFixed(1)}%`);
            if (result.lines) {
                this.log(`    Lines: ${result.lines}`);
            }
            this.log('');

            // Log snippet (truncated)
            if (result.content) {
                const snippet = result.content.substring(0, 300);
                snippet.split('\n').forEach(line => {
                    this.log(`    | ${line}`);
                });
                if (result.content.length > 300) {
                    this.log('    | ... (truncated)');
                }
            }
            this.log('');
        });
    }

    /**
     * Log enhanced prompt.
     */
    logEnhancedPrompt(original: string, enhanced: string): void {
        this.log('=== Prompt Enhancement ===');
        this.log('Original:');
        original.split('\n').forEach(line => {
            this.log(`  > ${line}`);
        });
        this.log('');
        this.log('Enhanced:');
        enhanced.split('\n').forEach(line => {
            this.log(`  < ${line}`);
        });
    }

    /**
     * Dispose the output channel.
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}
