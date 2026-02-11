import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { LocalEmbeddingService } from './embedding.js';

export interface FileChunk {
    id: string;      // Unique ID (e.g., filepath:chunkIndex)
    filePath: string;
    content: string; // The text content
    startLine: number;
    endLine: number;
    embedding?: number[]; // Stored as plain array for JSON serialization
}

export interface SearchResult {
    chunk: FileChunk;
    score: number;
}

export class LocalVectorStore {
    private chunks: FileChunk[] = [];
    private indexPath: string;
    private embeddingService: LocalEmbeddingService;
    private isLoaded = false;
    /** Maps filePath → content SHA-256 hash for skip-if-unchanged optimization */
    private fileHashes: Map<string, string> = new Map();

    constructor(workspacePath: string) {
        this.indexPath = path.join(workspacePath, '.local-context', 'index.json');
        this.embeddingService = LocalEmbeddingService.getInstance();
    }

    /** Compute SHA-256 hash of content for change detection */
    private hashContent(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Load the index from disk.
     */
    async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.indexPath, 'utf-8');
            const json = JSON.parse(data);
            this.chunks = json.chunks || [];
            // Restore file hashes from persisted index
            if (json.fileHashes && typeof json.fileHashes === 'object') {
                this.fileHashes = new Map(Object.entries(json.fileHashes));
            }
            this.isLoaded = true;
            console.error(`[LocalStore] Loaded ${this.chunks.length} chunks (${this.fileHashes.size} file hashes) from ${this.indexPath}`);
        } catch (error) {
            // If file doesn't exist, start empty
            this.chunks = [];
            this.fileHashes = new Map();
            this.isLoaded = true;
            console.error(`[LocalStore] No existing index found at ${this.indexPath}, starting fresh.`);
        }
    }

    /**
     * Save the index to disk.
     */
    async save(): Promise<void> {
        const dir = path.dirname(this.indexPath);
        await fs.mkdir(dir, { recursive: true });

        const data = JSON.stringify({
            version: 2,
            chunks: this.chunks,
            fileHashes: Object.fromEntries(this.fileHashes),
        }, null, 2);
        await fs.writeFile(this.indexPath, data, 'utf-8');
        console.error(`[LocalStore] Saved ${this.chunks.length} chunks (${this.fileHashes.size} file hashes) to disk.`);
    }

    /**
     * Add a file's chunks to the store.
     * Removes old chunks for this file first to handle updates.
     */
    async addFile(filePath: string, content: string): Promise<void> {
        // Content-hash skip: avoid re-embedding unchanged files
        const newHash = this.hashContent(content);
        const existingHash = this.fileHashes.get(filePath);
        if (existingHash === newHash) {
            // File hasn't changed, skip re-embedding
            return;
        }

        // 1. Remove existing chunks for this file
        this.removeFile(filePath);

        // 2. Chunk the file
        const chunks = this.createChunks(filePath, content);

        // 3. Generate embeddings
        for (const chunk of chunks) {
            const vector = await this.embeddingService.embed(chunk.content);
            chunk.embedding = Array.from(vector);
            this.chunks.push(chunk);
        }

        // 4. Store hash for future skip detection
        this.fileHashes.set(filePath, newHash);
    }

    removeFile(filePath: string): void {
        this.chunks = this.chunks.filter(c => c.filePath !== filePath);
        this.fileHashes.delete(filePath);
    }

    /**
     * Simple chunking strategy: fixed line count with overlap.
     */
    /**
     * Smart chunking strategy:
     * 1. Prepend file path to content for context.
     * 2. Attempt to split by Top-Level Definitions (Classes, Functions).
     * 3. Fallback to overlap if block is too big.
     */
    private createChunks(filePath: string, content: string): FileChunk[] {
        const lines = content.split('\n');
        const chunks: FileChunk[] = [];
        const MIN_CHUNK_SIZE = 20;
        const MAX_CHUNK_SIZE = 150;
        const OVERLAP = 20;

        // Metadata Header to help the element
        const fileHeader = `File: ${path.basename(filePath)}\nPath: ${filePath}\n`;

        let currentChunkLines: string[] = [];
        let startLine = 1;

        // Regex for code block boundaries
        // Matches: export class, function, async function, const X = () =>
        // Also Python: def, class
        const definitionRegex = /^(export\s+)?(className\s+|class\s+|interface\s+|type\s+|function\s+|async\s+function\s+|const\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|[^=]+)\s*=>|def\s+|class\s+)/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const isDefinition = definitionRegex.test(line);

            // If we hit a definition and our current chunk is "big enough", save it and start new.
            // This tries to keep the previous block together and start the new function in a new block.
            if (isDefinition && currentChunkLines.length >= MIN_CHUNK_SIZE) {
                this.pushChunk(chunks, filePath, currentChunkLines, startLine, fileHeader);
                // Start new chunk, but overlap slightly if previous was cut abruptly?
                // For definition boundaries, we typically want a clean start, but overlap helps continuity.
                // Let's keep the last few lines as overlap context.
                const overlapLines = currentChunkLines.slice(-Math.min(currentChunkLines.length, 5)); // Small context overlap
                currentChunkLines = [...overlapLines, line];
                startLine = (i + 1) - overlapLines.length;
                continue;
            }

            currentChunkLines.push(line);

            // If chunk gets too big, force split
            if (currentChunkLines.length >= MAX_CHUNK_SIZE) {
                this.pushChunk(chunks, filePath, currentChunkLines, startLine, fileHeader);
                // Heavy overlap for forced splits
                const overlapLines = currentChunkLines.slice(-OVERLAP);
                currentChunkLines = [...overlapLines];
                startLine = (i + 1) - OVERLAP;
            }
        }

        // Final chunk
        if (currentChunkLines.length > 0) {
            this.pushChunk(chunks, filePath, currentChunkLines, startLine, fileHeader);
        }

        return chunks;
    }

    private pushChunk(chunks: FileChunk[], filePath: string, lines: string[], startLine: number, header: string) {
        const text = lines.join('\n');
        // We prepend header for embedding, but maybe keep original content for display?
        // For simplicity, we just store the full text including header as 'content'
        // or we store raw content separate. For search, header helps matching.
        const finalContent = `${header}\n${text}`;

        chunks.push({
            id: `${filePath}:${startLine}`,
            filePath,
            content: finalContent,
            startLine: startLine,
            endLine: startLine + lines.length - 1,
        });
    }

    /**
     * Semantic search using cosine similarity.
     */
    async search(query: string, topK: number = 20): Promise<SearchResult[]> {
        if (!this.isLoaded) await this.load();

        const queryInfo = await this.embeddingService.embed(query);
        const queryVector = Array.from(queryInfo);

        const scores = this.chunks.map(chunk => {
            if (!chunk.embedding) return { chunk, score: -1 };
            return {
                chunk,
                score: this.cosineSimilarity(queryVector, chunk.embedding)
            };
        });

        // Sort descending by score
        scores.sort((a, b) => b.score - a.score);

        return scores.slice(0, topK);
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dot = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
