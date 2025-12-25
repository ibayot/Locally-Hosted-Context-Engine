/**
 * Status Bar Provider
 * 
 * Shows connection status in the VS Code status bar.
 */

import * as vscode from 'vscode';
import { ContextEngineClient } from '../client';

export class StatusBarProvider implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private client: ContextEngineClient;
    private disposed: boolean = false;

    constructor(client: ContextEngineClient) {
        this.client = client;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'contextEngine.showStatus';
        this.update();
    }

    /**
     * Update the status bar item based on connection state.
     */
    update(): void {
        if (this.disposed) {
            return;
        }

        const config = vscode.workspace.getConfiguration('contextEngine');
        const showStatusBar = config.get<boolean>('showStatusBar', true);

        if (!showStatusBar) {
            this.statusBarItem.hide();
            return;
        }

        if (this.client.isConnected()) {
            this.statusBarItem.text = `$(plug) Context Engine`;
            this.statusBarItem.tooltip = `Connected to ${this.client.getServerUrl()}\nVersion: ${this.client.getVersion()}`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = `$(debug-disconnect) Context Engine`;
            this.statusBarItem.tooltip = `Disconnected from ${this.client.getServerUrl()}\nClick to show status`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }

        this.statusBarItem.show();
    }

    /**
     * Show connecting state.
     */
    showConnecting(): void {
        if (this.disposed) {
            return;
        }
        this.statusBarItem.text = `$(sync~spin) Context Engine`;
        this.statusBarItem.tooltip = `Connecting to ${this.client.getServerUrl()}...`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
    }

    /**
     * Show error state.
     */
    showError(message: string): void {
        if (this.disposed) {
            return;
        }
        this.statusBarItem.text = `$(error) Context Engine`;
        this.statusBarItem.tooltip = `Error: ${message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.show();
    }

    /**
     * Dispose the status bar item.
     */
    dispose(): void {
        this.disposed = true;
        this.statusBarItem.dispose();
    }
}
