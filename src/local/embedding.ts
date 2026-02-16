import { pipeline, env } from '@xenova/transformers';
import * as path from 'path';
import { log } from '../utils/logger.js';
import { EmbeddingWorkerPool } from '../workers/embeddingPool.js';
import { featureEnabled } from '../config/features.js';

// Disable local model checks if needed, or configure cache location
// env.cacheDir = path.join(process.cwd(), '.local-context', 'models'); // Moving to configure()

export class LocalEmbeddingService {
    private static instance: LocalEmbeddingService;
    private pipe: any = null;
    private modelName = 'Xenova/all-MiniLM-L6-v2';
    private initializationPromise: Promise<void> | null = null;
    private isConfigured = false;
    private workerPool: EmbeddingWorkerPool | null = null;
    private workspacePath: string | null = null;

    private constructor() { }

    public static getInstance(): LocalEmbeddingService {
        if (!LocalEmbeddingService.instance) {
            LocalEmbeddingService.instance = new LocalEmbeddingService();
        }
        return LocalEmbeddingService.instance;
    }

    public configure(workspacePath: string) {
        if (this.isConfigured) return;
        this.workspacePath = workspacePath;
        const cacheDir = path.join(workspacePath, '.local-context', 'models');
        env.cacheDir = cacheDir;
        
        // Allow remote downloads for model initialization
        env.allowRemoteModels = true;
        env.allowLocalModels = true;
        
        log.info(`[LocalEmbedding] Configured cache directory: ${cacheDir}`);
        this.isConfigured = true;
    }

    /**
     * Initialize the model pipeline.
     */
    public async init(): Promise<void> {
        if (this.pipe) return;
        if (this.initializationPromise) return this.initializationPromise;

        // Initialize worker pool if enabled (after ensuring model is cached)
        if (featureEnabled('use_worker_threads') && this.workspacePath && !this.workerPool) {
            const cacheDir = path.join(this.workspacePath, '.local-context', 'models');
            
            // Pre-download model in main thread first to ensure it's cached
            log.info('[LocalEmbedding] Pre-downloading model before worker pool initialization...');
            try {
                const tempPipe = await pipeline('feature-extraction', this.modelName);
                log.info('[LocalEmbedding] Model cached successfully, initializing worker pool');
            } catch (err) {
                log.error('[LocalEmbedding] Failed to pre-download model', { error: String(err) });
                throw err;
            }
            
            this.workerPool = new EmbeddingWorkerPool(this.modelName, cacheDir);
            log.info('[LocalEmbedding] Worker pool initialized');
            return; // Worker pool doesn't need main thread pipeline
        }

        this.initializationPromise = (async () => {
            const maxRetries = 5;
            let lastError;

            for (let i = 0; i < maxRetries; i++) {
                try {
                    log.info(`[LocalEmbedding] Loading model ${this.modelName} (Attempt ${i + 1}/${maxRetries})...`);
                    this.pipe = await pipeline('feature-extraction', this.modelName);
                    log.info('[LocalEmbedding] Model loaded successfully.');
                    return;
                } catch (err) {
                    log.error(`[LocalEmbedding] Failed to load model (Attempt ${i + 1})`, { error: String(err) });
                    lastError = err;
                    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                    const delay = Math.pow(2, i) * 1000;
                    log.info(`[LocalEmbedding] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            this.initializationPromise = null; // Clear lock so we can try again later if needed? Or keep it failed?
            throw lastError || new Error('Failed to load model after retries');
        })();

        return this.initializationPromise;
    }

    /**
     * Generate embeddings for a text string.
     * Returns a Float32Array of the embedding vector.
     */
    public async embed(text: string): Promise<Float32Array> {
        // Use worker pool if available
        if (this.workerPool) {
            const embedding = await this.workerPool.embed(text);
            return new Float32Array(embedding);
        }

        // Fallback to main thread
        if (!this.pipe) await this.init();

        // Generate output
        // log.debug(`[LocalEmbedding] Embedding text of length ${text.length}...`);
        const output = await this.pipe(text, { pooling: 'mean', normalize: true });
        // log.debug(`[LocalEmbedding] Embedding complete.`);

        // Check if output is a Tensor and get data
        if (output && output.data) {
            return output.data as Float32Array;
        }

        throw new Error('Failed to generate embedding');
    }
}
