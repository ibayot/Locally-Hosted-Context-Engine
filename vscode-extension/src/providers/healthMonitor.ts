/**
 * Health Monitor
 * 
 * Monitors server health and handles reconnection.
 */

import * as vscode from 'vscode';
import { ContextEngineClient } from '../client';
import { StatusBarProvider } from './statusBarProvider';
import { StatusTreeProvider } from './statusTreeProvider';
import { OutputChannelManager } from './outputChannelManager';

export interface HealthMonitorOptions {
    /** Check interval in milliseconds (default: 30000) */
    checkInterval?: number;
    /** Maximum retry attempts before giving up (default: 5) */
    maxRetries?: number;
    /** Retry delay in milliseconds (default: 5000) */
    retryDelay?: number;
    /** Enable auto-reconnection (default: true) */
    autoReconnect?: boolean;
}

export class HealthMonitor implements vscode.Disposable {
    private client: ContextEngineClient;
    private statusBar: StatusBarProvider;
    private statusTree: StatusTreeProvider;
    private output: OutputChannelManager;

    private checkInterval: number;
    private maxRetries: number;
    private retryDelay: number;
    private autoReconnect: boolean;

    private intervalId: NodeJS.Timeout | null = null;
    private retryCount: number = 0;
    private isReconnecting: boolean = false;
    private wasConnected: boolean = false;
    private disposed: boolean = false;

    constructor(
        client: ContextEngineClient,
        statusBar: StatusBarProvider,
        statusTree: StatusTreeProvider,
        output: OutputChannelManager,
        options?: HealthMonitorOptions
    ) {
        this.client = client;
        this.statusBar = statusBar;
        this.statusTree = statusTree;
        this.output = output;

        this.checkInterval = options?.checkInterval ?? 30000;
        this.maxRetries = options?.maxRetries ?? 5;
        this.retryDelay = options?.retryDelay ?? 5000;
        this.autoReconnect = options?.autoReconnect ?? true;
    }

    /**
     * Start health monitoring.
     */
    start(): void {
        if (this.intervalId || this.disposed) {
            return;
        }

        this.output.log('Health monitoring started');
        this.wasConnected = this.client.isConnected();

        this.intervalId = setInterval(() => {
            this.checkHealth();
        }, this.checkInterval);
    }

    /**
     * Stop health monitoring.
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.output.log('Health monitoring stopped');
        }
    }

    /**
     * Check server health.
     */
    private async checkHealth(): Promise<void> {
        if (this.disposed || this.isReconnecting) {
            return;
        }

        try {
            // Try to get health status
            await this.client.connect();

            // Connection successful
            if (!this.wasConnected) {
                this.output.log('Connection restored');
                vscode.window.showInformationMessage('Context Engine: Connection restored');
            }

            this.wasConnected = true;
            this.retryCount = 0;
            this.statusBar.update();
            await this.statusTree.refresh();
        } catch (error) {
            // Connection failed
            if (this.wasConnected) {
                this.output.log('Connection lost');
                this.wasConnected = false;
                this.statusBar.update();
                await this.statusTree.refresh();

                if (this.autoReconnect) {
                    this.scheduleReconnect();
                } else {
                    vscode.window.showWarningMessage(
                        'Context Engine: Connection lost. Auto-reconnect is disabled.'
                    );
                }
            }
        }
    }

    /**
     * Schedule a reconnection attempt.
     */
    private scheduleReconnect(): void {
        if (this.isReconnecting || this.disposed) {
            return;
        }

        if (this.retryCount >= this.maxRetries) {
            this.output.log(`Max retries (${this.maxRetries}) reached. Giving up.`);
            vscode.window.showErrorMessage(
                `Context Engine: Failed to reconnect after ${this.maxRetries} attempts. ` +
                'Use "Context Engine: Connect to Server" to retry manually.'
            );
            return;
        }

        this.isReconnecting = true;
        this.retryCount++;

        this.output.log(`Reconnection attempt ${this.retryCount}/${this.maxRetries} in ${this.retryDelay}ms`);
        this.statusBar.showConnecting();

        setTimeout(async () => {
            if (this.disposed) {
                return;
            }

            try {
                await this.client.connect();

                this.output.log('Reconnection successful');
                this.wasConnected = true;
                this.retryCount = 0;
                this.statusBar.update();
                await this.statusTree.refresh();

                vscode.window.showInformationMessage('Context Engine: Reconnected successfully');
            } catch (error) {
                this.output.log(`Reconnection failed: ${error instanceof Error ? error.message : error}`);
                this.scheduleReconnect();
            } finally {
                this.isReconnecting = false;
            }
        }, this.retryDelay);
    }

    /**
     * Force an immediate health check.
     */
    async forceCheck(): Promise<void> {
        await this.checkHealth();
    }

    /**
     * Get monitoring status.
     */
    getStatus(): { running: boolean; retryCount: number; wasConnected: boolean } {
        return {
            running: this.intervalId !== null,
            retryCount: this.retryCount,
            wasConnected: this.wasConnected,
        };
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        this.disposed = true;
        this.stop();
    }
}
