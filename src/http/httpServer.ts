/**
 * HTTP Server for Context Engine
 * 
 * Provides HTTP transport layer for VS Code extension and other HTTP clients.
 * This is an ADDITIVE layer - the existing stdio transport remains unchanged.
 * 
 * Architecture:
 * - Uses the same ContextServiceClient as the stdio server
 * - All tool calls delegate to existing service methods
 * - No modifications to core MCP logic
 */

import express, { type Express } from 'express';
import type { Server } from 'http';
import type { ContextServiceClient } from '../mcp/serviceClient.js';
import {
    createCorsMiddleware,
    loggingMiddleware,
    errorHandler,
} from './middleware/index.js';
import {
    createHealthRouter,
    createStatusRouter,
    createToolsRouter,
} from './routes/index.js';

export interface HttpServerOptions {
    /** Port to listen on (default: 3333) */
    port?: number;
    /** Server version for health endpoint */
    version?: string;
}

/**
 * HTTP Server wrapper for Context Engine.
 * 
 * Exposes MCP tools via REST-like HTTP endpoints for VS Code extension
 * and other HTTP clients.
 */
export class ContextEngineHttpServer {
    private app: Express;
    private server: Server | null = null;
    private readonly port: number;
    private readonly version: string;

    constructor(
        private readonly serviceClient: ContextServiceClient,
        options: HttpServerOptions = {}
    ) {
        this.port = options.port || 3333;
        this.version = options.version || '1.0.0';
        this.app = this.createApp();
    }

    /**
     * Create and configure Express application.
     */
    private createApp(): Express {
        const app = express();

        // Middleware
        app.use(express.json());
        app.use(createCorsMiddleware());
        app.use(loggingMiddleware);

        // Health endpoint at root level
        app.use(createHealthRouter(this.version));

        // API routes under /api/v1
        app.use('/api/v1', createStatusRouter(this.serviceClient));
        app.use('/api/v1', createToolsRouter(this.serviceClient));

        // Error handler (must be last)
        app.use(errorHandler);

        return app;
    }

    /**
     * Start the HTTP server.
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    console.error(`[HTTP] Server listening on http://localhost:${this.port}`);
                    console.error(`[HTTP] Health: http://localhost:${this.port}/health`);
                    console.error(`[HTTP] API: http://localhost:${this.port}/api/v1/`);
                    resolve();
                });

                this.server.on('error', (err: NodeJS.ErrnoException) => {
                    if (err.code === 'EADDRINUSE') {
                        console.error(`[HTTP] Port ${this.port} is already in use`);
                    }
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Stop the HTTP server.
     */
    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }

            this.server.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.error('[HTTP] Server stopped');
                    this.server = null;
                    resolve();
                }
            });
        });
    }

    /**
     * Get the port the server is listening on.
     */
    getPort(): number {
        return this.port;
    }

    /**
     * Check if the server is running.
     */
    isRunning(): boolean {
        return this.server !== null;
    }

    /**
     * Get the Express app instance (for testing).
     */
    getApp(): Express {
        return this.app;
    }
}
