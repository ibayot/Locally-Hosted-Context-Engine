/**
 * Layer 1: Local Service Layer - Ollama LLM Provider
 *
 * Provides local LLM generation via Ollama's REST API.
 * Supports chat, generate, and model management.
 *
 * Configuration:
 *   OLLAMA_URL   — Ollama server URL (default: http://localhost:11434)
 *   OLLAMA_MODEL — Model to use (default: qwen2.5-coder:7b)
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 */

// ============================================================================
// Types
// ============================================================================

export interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OllamaChatRequest {
    model: string;
    messages: OllamaMessage[];
    stream?: boolean;
    options?: OllamaOptions;
}

export interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    system?: string;
    stream?: boolean;
    options?: OllamaOptions;
}

export interface OllamaOptions {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;     // max tokens
    num_ctx?: number;         // context window size
    repeat_penalty?: number;
    seed?: number;
    stop?: string[];
}

export interface OllamaChatResponse {
    model: string;
    message: OllamaMessage;
    done: boolean;
    total_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

export interface OllamaGenerateResponse {
    model: string;
    response: string;
    done: boolean;
    total_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

export interface OllamaModel {
    name: string;
    size: number;
    modified_at: string;
}

export interface OllamaStatus {
    available: boolean;
    url: string;
    model: string;
    models: string[];
    error?: string;
}

// ============================================================================
// Provider
// ============================================================================

export class OllamaProvider {
    private url: string;
    private model: string;
    private _status: OllamaStatus | null = null;
    private _statusCheckedAt = 0;
    private static readonly STATUS_TTL_MS = 30_000; // Cache status for 30s

    constructor(
        url?: string,
        model?: string,
    ) {
        this.url = (url || process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
        this.model = model || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
    }

    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------

    /** Get the configured model name */
    get modelName(): string {
        return this.model;
    }

    /** Get the configured server URL */
    get serverUrl(): string {
        return this.url;
    }

    /**
     * Check if Ollama is available and has the configured model.
     * Caches the result for STATUS_TTL_MS.
     */
    async isAvailable(): Promise<boolean> {
        const status = await this.getStatus();
        return status.available;
    }

    /**
     * Get detailed Ollama status including available models.
     */
    async getStatus(forceRefresh = false): Promise<OllamaStatus> {
        const now = Date.now();
        if (!forceRefresh && this._status && (now - this._statusCheckedAt) < OllamaProvider.STATUS_TTL_MS) {
            return this._status;
        }

        try {
            const response = await fetch(`${this.url}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5_000),
            });

            if (!response.ok) {
                this._status = {
                    available: false,
                    url: this.url,
                    model: this.model,
                    models: [],
                    error: `Ollama returned HTTP ${response.status}`,
                };
            } else {
                const data = await response.json() as { models?: OllamaModel[] };
                const models = (data.models || []).map(m => m.name);

                // Check if configured model is available (exact or prefix match)
                const modelAvailable = models.some(m =>
                    m === this.model || m.startsWith(this.model.split(':')[0])
                );

                this._status = {
                    available: modelAvailable,
                    url: this.url,
                    model: this.model,
                    models,
                    error: modelAvailable ? undefined : `Model '${this.model}' not found. Available: ${models.join(', ') || 'none'}. Run: ollama pull ${this.model}`,
                };
            }
        } catch (err: any) {
            this._status = {
                available: false,
                url: this.url,
                model: this.model,
                models: [],
                error: `Ollama not reachable at ${this.url}: ${err.message || err}`,
            };
        }

        this._statusCheckedAt = now;
        return this._status;
    }

    /**
     * Chat completion — multi-turn conversation with system prompt support.
     * Best for: planning, review, BMAD workflows.
     */
    async chat(
        messages: OllamaMessage[],
        options?: OllamaOptions,
    ): Promise<string> {
        const available = await this.isAvailable();
        if (!available) {
            const status = await this.getStatus();
            throw new Error(`Ollama LLM not available: ${status.error}`);
        }

        const body: OllamaChatRequest = {
            model: this.model,
            messages,
            stream: false,
            options: {
                num_ctx: 8192,
                temperature: 0.3,      // Lower temp for code tasks
                ...options,
            },
        };

        console.error(`[Ollama] Chat request: ${messages.length} messages, model=${this.model}`);
        const startMs = Date.now();

        const response = await fetch(`${this.url}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120_000), // 2min timeout for long generations
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama chat failed (HTTP ${response.status}): ${errText}`);
        }

        const result = await response.json() as OllamaChatResponse;
        const durationMs = Date.now() - startMs;
        const tokPerSec = result.eval_count && result.eval_duration
            ? Math.round(result.eval_count / (result.eval_duration / 1e9))
            : 0;

        console.error(`[Ollama] Chat response: ${result.message.content.length} chars, ${durationMs}ms, ${tokPerSec} tok/s`);

        return result.message.content;
    }

    /**
     * Single-shot generation with optional system prompt.
     * Best for: code generation, simple Q&A.
     */
    async generate(
        prompt: string,
        systemPrompt?: string,
        options?: OllamaOptions,
    ): Promise<string> {
        const available = await this.isAvailable();
        if (!available) {
            const status = await this.getStatus();
            throw new Error(`Ollama LLM not available: ${status.error}`);
        }

        const body: OllamaGenerateRequest = {
            model: this.model,
            prompt,
            system: systemPrompt,
            stream: false,
            options: {
                num_ctx: 8192,
                temperature: 0.3,
                ...options,
            },
        };

        console.error(`[Ollama] Generate request: ${prompt.length} chars, model=${this.model}`);
        const startMs = Date.now();

        const response = await fetch(`${this.url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(120_000),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama generate failed (HTTP ${response.status}): ${errText}`);
        }

        const result = await response.json() as OllamaGenerateResponse;
        const durationMs = Date.now() - startMs;
        const tokPerSec = result.eval_count && result.eval_duration
            ? Math.round(result.eval_count / (result.eval_duration / 1e9))
            : 0;

        console.error(`[Ollama] Generate response: ${result.response.length} chars, ${durationMs}ms, ${tokPerSec} tok/s`);

        return result.response;
    }

    /**
     * RAG-style generation: search context + LLM generation.
     * Combines retrieved code snippets with a user prompt for grounded answers.
     */
    async searchAndAsk(
        query: string,
        context: string,
        prompt?: string,
    ): Promise<string> {
        const systemPrompt = `You are an expert code assistant. You analyze codebases and provide precise, actionable answers.
When given code context, focus on the specific question asked. Be concise but thorough.
If the context doesn't contain enough information to answer, say so clearly.`;

        const fullPrompt = prompt
            ? `## Context\n${context}\n\n## Task\n${prompt}`
            : `## Context\n${context}\n\n## Question\n${query}`;

        return this.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullPrompt },
        ]);
    }

    /**
     * List available models on the Ollama server.
     */
    async listModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.url}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5_000),
            });
            if (!response.ok) return [];
            const data = await response.json() as { models?: OllamaModel[] };
            return (data.models || []).map(m => m.name);
        } catch {
            return [];
        }
    }
}

// ============================================================================
// Singleton
// ============================================================================

let _instance: OllamaProvider | null = null;

/**
 * Get or create the global OllamaProvider instance.
 */
export function getOllamaProvider(url?: string, model?: string): OllamaProvider {
    if (!_instance) {
        _instance = new OllamaProvider(url, model);
    }
    return _instance;
}

/**
 * Reset the global instance (for testing or reconfiguration).
 */
export function resetOllamaProvider(): void {
    _instance = null;
}
