import { pipeline, env } from '@xenova/transformers';
import * as path from 'path';

// Disable local model checks if needed, or configure cache location
// env.cacheDir = path.join(process.cwd(), '.local-context', 'models'); // Moving to configure()

export class LocalEmbeddingService {
    private static instance: LocalEmbeddingService;
    private pipe: any = null;
    private modelName = 'Xenova/all-MiniLM-L6-v2';
    private initializationPromise: Promise<void> | null = null;
    private isConfigured = false;

    private constructor() { }

    public static getInstance(): LocalEmbeddingService {
        if (!LocalEmbeddingService.instance) {
            LocalEmbeddingService.instance = new LocalEmbeddingService();
        }
        return LocalEmbeddingService.instance;
    }

    public configure(workspacePath: string) {
        if (this.isConfigured) return;
        env.cacheDir = path.join(workspacePath, '.local-context', 'models');
        console.error(`[LocalEmbedding] Configured cache directory: ${env.cacheDir}`);
        this.isConfigured = true;
    }

    /**
     * Initialize the model pipeline.
     */
    public async init(): Promise<void> {
        if (this.pipe) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            const maxRetries = 5;
            let lastError;

            for (let i = 0; i < maxRetries; i++) {
                try {
                    console.error(`[LocalEmbedding] Loading model ${this.modelName} (Attempt ${i + 1}/${maxRetries})...`);
                    this.pipe = await pipeline('feature-extraction', this.modelName);
                    console.error('[LocalEmbedding] Model loaded successfully.');
                    return;
                } catch (err) {
                    console.error(`[LocalEmbedding] Failed to load model (Attempt ${i + 1}):`, err);
                    lastError = err;
                    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                    const delay = Math.pow(2, i) * 1000;
                    console.error(`[LocalEmbedding] Retrying in ${delay}ms...`);
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
        if (!this.pipe) await this.init();

        // Generate output
        // console.log(`[LocalEmbedding] Embedding text of length ${text.length}...`);
        const output = await this.pipe(text, { pooling: 'mean', normalize: true });
        // console.log(`[LocalEmbedding] Embedding complete.`);

        // Check if output is a Tensor and get data
        if (output && output.data) {
            return output.data as Float32Array;
        }

        throw new Error('Failed to generate embedding');
    }
}
