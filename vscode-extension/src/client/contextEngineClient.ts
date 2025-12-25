/**
 * Context Engine HTTP Client
 *
 * Communicates with the Context Engine HTTP server.
 */

import * as vscode from 'vscode';

/** Default timeout for HTTP requests (30 seconds) */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Extended timeout for AI operations like enhance-prompt (120 seconds) */
const AI_REQUEST_TIMEOUT_MS = 120000;

export interface HealthResponse {
    status: string;
    version: string;
    timestamp: string;
}

export interface IndexStatus {
    workspace: string;
    status: 'idle' | 'indexing' | 'error';
    lastIndexed: string | null;
    fileCount: number;
    isStale: boolean;
    lastError?: string;
}

export interface SearchResult {
    path: string;
    content: string;
    score?: number;
    lines?: string;
    relevanceScore?: number;
}

export interface SearchResponse {
    results: SearchResult[];
    metadata: {
        query: string;
        top_k: number;
        resultCount: number;
    };
}

export interface IndexResponse {
    success: boolean;
    message?: string;
    indexed?: number;
    skipped?: number;
    errors?: string[];
    duration?: number;
}

export interface EnhancePromptResponse {
    enhanced: string;
    original: string;
}

/**
 * HTTP client for communicating with Context Engine server.
 */
    export class ContextEngineClient {
        private serverUrl: string;
        private connected: boolean = false;
        private version: string = '';

        // Emit connection state changes so other components (like CodeLens)
        // can react when the user connects/disconnects or the server URL changes.
        private _onDidChangeConnection = new vscode.EventEmitter<boolean>();
        public readonly onDidChangeConnection = this._onDidChangeConnection.event;

    constructor(serverUrl?: string) {
        this.serverUrl = serverUrl || this.getConfiguredServerUrl();
    }

    /**
     * Get the server URL from VS Code configuration.
     */
    private getConfiguredServerUrl(): string {
        const config = vscode.workspace.getConfiguration('contextEngine');
        return config.get<string>('serverUrl') || 'http://localhost:3333';
    }

    /**
     * Update the server URL.
     */
    setServerUrl(url: string): void {
        this.serverUrl = url;
            this.connected = false;
            this.version = '';
            this._onDidChangeConnection.fire(false);
    }

    /**
     * Get the current server URL.
     */
    getServerUrl(): string {
        return this.serverUrl;
    }

    /**
     * Check if connected to the server.
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get the server version (after connecting).
     */
    getVersion(): string {
        return this.version;
    }

    /**
     * Make an HTTP request to the server with timeout support.
     * @param method HTTP method
     * @param path API path
     * @param body Request body
     * @param timeoutMs Timeout in milliseconds (default: 30s, AI ops: 120s)
     * @param abortSignal Optional external AbortSignal for cancellation
     */
    private async request<T>(
        method: 'GET' | 'POST',
        path: string,
        body?: unknown,
        timeoutMs?: number,
        abortSignal?: AbortSignal
    ): Promise<T> {
        const url = `${this.serverUrl}${path}`;

        // Determine appropriate timeout based on endpoint
        const isAiEndpoint = path.includes('enhance-prompt') || path.includes('plan');
        const timeout = timeoutMs ?? (isAiEndpoint ? AI_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS);

        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeout);

        // Link external abort signal if provided
        if (abortSignal) {
            if (abortSignal.aborted) {
                clearTimeout(timeoutId);
                throw new Error('Request was cancelled');
            }
            abortSignal.addEventListener('abort', () => {
                controller.abort();
                clearTimeout(timeoutId);
            });
        }

        const options: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json() as Promise<T>;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    // Check if it was a timeout or external cancellation
                    if (abortSignal?.aborted) {
                        throw new Error('Request was cancelled');
                    }
                    throw new Error(`Request timed out after ${timeout / 1000}s. The server may be busy or the operation is taking too long.`);
                }
                // Network errors
                if (error.message.includes('fetch') || error.message.includes('network')) {
                    throw new Error(`Connection failed: ${error.message}. Is the server running?`);
                }
            }
            throw error;
        }
    }

    /**
     * Connect to the server (health check).
     */
    async connect(): Promise<HealthResponse> {
        try {
            const health = await this.request<HealthResponse>('GET', '/health');
            this.connected = true;
            this.version = health.version;
                this._onDidChangeConnection.fire(true);
            return health;
        } catch (error) {
            this.connected = false;
            this.version = '';
                this._onDidChangeConnection.fire(false);
            throw error;
        }
    }

    /**
     * Disconnect from the server.
     */
    disconnect(): void {
        this.connected = false;
        this.version = '';
            this._onDidChangeConnection.fire(false);
    }

    /**
     * Get index status.
     */
    async getStatus(): Promise<IndexStatus> {
        return this.request<IndexStatus>('GET', '/api/v1/status');
    }

    /**
     * Index the workspace.
     */
    async indexWorkspace(background: boolean = false): Promise<IndexResponse> {
        return this.request<IndexResponse>('POST', '/api/v1/index', { background });
    }

    /**
     * Perform semantic search.
     * @param query Search query
     * @param topK Number of results to return
     * @param abortSignal Optional AbortSignal for cancellation
     */
    async search(query: string, topK: number = 10, abortSignal?: AbortSignal): Promise<SearchResponse> {
        return this.request<SearchResponse>('POST', '/api/v1/search', {
            query,
            top_k: topK,
        }, undefined, abortSignal);
    }

    /**
     * Enhance a prompt with codebase context.
     * @param prompt The prompt to enhance
     * @param abortSignal Optional AbortSignal for cancellation
     */
    async enhancePrompt(prompt: string, abortSignal?: AbortSignal): Promise<EnhancePromptResponse> {
        return this.request<EnhancePromptResponse>('POST', '/api/v1/enhance-prompt', {
            prompt,
        }, AI_REQUEST_TIMEOUT_MS, abortSignal);
    }

    /**
     * Create an implementation plan.
     * @param task Task description
     * @param abortSignal Optional AbortSignal for cancellation
     */
    async createPlan(task: string, abortSignal?: AbortSignal): Promise<{ plan?: string;[key: string]: unknown }> {
        return this.request<{ plan?: string }>('POST', '/api/v1/plan', {
            task,
        }, AI_REQUEST_TIMEOUT_MS, abortSignal);
    }

    /**
     * Perform codebase retrieval.
     * @param query Search query
     * @param topK Number of results to return
     * @param abortSignal Optional AbortSignal for cancellation
     */
    async codebaseRetrieval(query: string, topK: number = 10, abortSignal?: AbortSignal): Promise<{ results?: SearchResult[];[key: string]: unknown }> {
        return this.request<{ results?: SearchResult[] }>('POST', '/api/v1/codebase-retrieval', {
            query,
            top_k: topK,
        }, undefined, abortSignal);
    }
}
