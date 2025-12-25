/**
 * Server Manager
 * 
 * Manages the Context Engine server process lifecycle.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { OutputChannelManager } from './outputChannelManager';

export interface ServerManagerOptions {
    /** Path to the server executable or script */
    serverPath?: string;
    /** Port to run the server on */
    port?: number;
    /** Workspace path to index */
    workspacePath?: string;
    /** Additional CLI arguments */
    additionalArgs?: string[];
}

export class ServerManager implements vscode.Disposable {
    private output: OutputChannelManager;
    private serverProcess: ChildProcess | null = null;
    private serverPath: string | null = null;
    private port: number = 3333;
    private workspacePath: string;

    constructor(output: OutputChannelManager, options?: ServerManagerOptions) {
        this.output = output;
        this.port = options?.port ?? 3333;
        this.serverPath = options?.serverPath ?? null;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.workspacePath = options?.workspacePath ?? workspaceFolder?.uri.fsPath ?? process.cwd();
    }

    /**
     * Check if the server process is running.
     */
    isRunning(): boolean {
        return this.serverProcess !== null && !this.serverProcess.killed;
    }

    /**
     * Get the server URL.
     */
    getServerUrl(): string {
        return `http://localhost:${this.port}`;
    }

    /**
     * Start the server process.
     */
    async start(): Promise<void> {
        if (this.isRunning()) {
            this.output.log('Server is already running');
            return;
        }

        const serverScript = await this.findServerScript();
        if (!serverScript) {
            throw new Error('Could not find Context Engine server. Please configure the server path.');
        }

        this.output.log(`Starting server from: ${serverScript}`);
        this.output.log(`Workspace: ${this.workspacePath}`);
        this.output.log(`Port: ${this.port}`);

        const args = [
            serverScript,
            '--workspace', this.workspacePath,
            '--http-only',
            '--port', String(this.port),
        ];

        // Use tsx to run TypeScript directly, or node for compiled JS
        const isTypeScript = serverScript.endsWith('.ts');
        const command = isTypeScript ? 'npx' : 'node';
        const fullArgs = isTypeScript ? ['tsx', ...args] : args;

        this.serverProcess = spawn(command, fullArgs, {
            cwd: path.dirname(serverScript),
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
        });

        // Log server output
        this.serverProcess.stdout?.on('data', (data) => {
            const lines = data.toString().split('\n').filter((l: string) => l.trim());
            lines.forEach((line: string) => this.output.log(`[server] ${line}`));
        });

        this.serverProcess.stderr?.on('data', (data) => {
            const lines = data.toString().split('\n').filter((l: string) => l.trim());
            lines.forEach((line: string) => this.output.log(`[server] ${line}`));
        });

        this.serverProcess.on('error', (error) => {
            this.output.error('Server process error', error);
        });

        this.serverProcess.on('exit', (code, signal) => {
            this.output.log(`Server process exited (code: ${code}, signal: ${signal})`);
            this.serverProcess = null;
        });

        // Wait for server to be ready
        await this.waitForServer(10000);
        this.output.log('Server started successfully');
    }

    /**
     * Stop the server process.
     */
    async stop(): Promise<void> {
        if (!this.serverProcess) {
            return;
        }

        this.output.log('Stopping server...');

        return new Promise((resolve) => {
            const process = this.serverProcess;
            if (!process) {
                resolve();
                return;
            }

            const cleanup = () => {
                this.serverProcess = null;
                resolve();
            };

            process.on('exit', cleanup);

            // Try graceful shutdown
            process.kill('SIGTERM');

            // Force kill after timeout
            setTimeout(() => {
                if (this.serverProcess && !this.serverProcess.killed) {
                    this.output.log('Force killing server...');
                    this.serverProcess.kill('SIGKILL');
                }
                cleanup();
            }, 5000);
        });
    }

    /**
     * Find the server script.
     */
    private async findServerScript(): Promise<string | null> {
        // Check configured path
        if (this.serverPath) {
            return this.serverPath;
        }

        // Check VS Code configuration
        const config = vscode.workspace.getConfiguration('contextEngine');
        const configuredPath = config.get<string>('serverPath');
        if (configuredPath) {
            return configuredPath;
        }

        // Try common locations relative to workspace
        const candidates = [
            // In the workspace itself (if working on context-engine)
            'src/index.ts',
            'dist/index.js',
            // In node_modules
            'node_modules/context-engine-mcp-server/dist/index.js',
            // Global installation
            path.join(process.env.HOME || process.env.USERPROFILE || '', '.context-engine', 'index.js'),
        ];

        for (const candidate of candidates) {
            const fullPath = path.isAbsolute(candidate)
                ? candidate
                : path.join(this.workspacePath, candidate);

            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
                return fullPath;
            } catch {
                // File doesn't exist, try next
            }
        }

        return null;
    }

    /**
     * Wait for the server to be ready.
     */
    private async waitForServer(timeoutMs: number): Promise<void> {
        const startTime = Date.now();
        const checkInterval = 500;

        while (Date.now() - startTime < timeoutMs) {
            try {
                const response = await fetch(`http://localhost:${this.port}/health`);
                if (response.ok) {
                    return;
                }
            } catch {
                // Server not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        throw new Error(`Server did not start within ${timeoutMs}ms`);
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        this.stop().catch(() => { });
    }
}
