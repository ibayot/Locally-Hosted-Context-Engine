import { LocalVectorStore, SearchResult } from './store.js';
import { LocalEmbeddingService } from './embedding.js';
import { getOllamaProvider, OllamaProvider } from './ollamaProvider.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';
import pLimit from 'p-limit';

// Adapting to internal interfaces
export interface SearchOptions {
    topK?: number;
}

export class LocalContextService {
    private store: LocalVectorStore;
    private workspacePath: string;

    private constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.store = new LocalVectorStore(workspacePath);
    }

    static async create(workspacePath: string, token?: string): Promise<LocalContextService> {
        console.error('[LocalContextService] Initializing local context engine...');

        // Configure and initialize embedding service first
        const embeddingService = LocalEmbeddingService.getInstance();
        embeddingService.configure(workspacePath);

        try {
            await embeddingService.init();
        } catch (err) {
            console.error('[LocalContextService] CRITICAL: Failed to initialize embedding model. Indexing will not work.', err);
            // We allow the service to be created, but it won't be able to index/search effectively.
            // Or should we throw? throwing might crash the server. 
            // Let's throw for now as without embeddings we are dead.
            throw err;
        }

        const service = new LocalContextService(workspacePath);
        await service.store.load();
        return service;
    }

    /**
     * Index the workspace locally using parallel processing.
     */
    async index(): Promise<void> {
        console.error('[LocalContextService] Starting local indexing (Parallel Mode)...');
        const startTime = Date.now();
        const limit = pLimit(1); // Serial execution to save CPU

        // 1. Find all files
        const files = await this.findFiles(this.workspacePath);
        console.error(`[LocalContextService] Found ${files.length} files to index.`);

        // 2. Process files
        let indexedCount = 0;
        const tasks = files.map(file => limit(async () => {
            // Yield to event loop and OS scheduler to save CPU
            await new Promise(resolve => setTimeout(resolve, 50));
            try {
                const content = await fs.readFile(file, 'utf-8');
                await this.store.addFile(file, content);
                indexedCount++;
                if (indexedCount % 50 === 0) {
                    console.error(`[LocalContextService] Indexed ${indexedCount}/${files.length} files...`);
                }
            } catch (err) {
                console.error(`[LocalContextService] Failed to index ${file}:`, err);
            }
        }));

        await Promise.all(tasks);

        // 3. Save index
        await this.store.save();
        console.error(`[LocalContextService] Parallel Indexing complete in ${Date.now() - startTime}ms.`);
    }

    /**
     * Add specific files to the index.
     */
    async addToIndex(files: { path: string, contents: string }[], options?: { waitForIndexing?: boolean }): Promise<void> {
        for (const file of files) {
            try {
                // Convert absolute path if needed, or assume path is absolute?
                // ServiceClient usually passes absolute paths or relative?
                // In serviceClient.ts: `file.path` comes from file discovery which returns absolute.
                // But let's check.
                // Actually, serviceClient uses `path.join(this.workspacePath, ...)` sometimes.
                // But IndexWorker passes objects.
                // We'll treat path as absolute if possible, or join with workspace.
                let fullPath = file.path;
                if (!path.isAbsolute(fullPath)) {
                    fullPath = path.join(this.workspacePath, fullPath);
                }
                await this.store.addFile(fullPath, file.contents);
            } catch (error) {
                console.error(`[LocalContextService] Failed to add file ${file.path}:`, error);
            }
        }
        // Auto-save after batch update
        await this.store.save();
    }

    private async findFiles(dir: string): Promise<string[]> {
        let results: string[] = [];
        try {
            const list = await fs.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.join(dir, dirent.name);
                const relativePath = path.relative(this.workspacePath, fullPath);

                // Simple Ignore Check
                if (this.shouldIgnore(relativePath)) continue;

                if (dirent.isDirectory()) {
                    results = results.concat(await this.findFiles(fullPath));
                } else {
                    if (this.isIndexable(relativePath)) {
                        results.push(fullPath);
                    }
                }
            }
        } catch (err) {
            console.error(`Error walking ${dir}:`, err);
        }
        return results;
    }

    private shouldIgnore(relPath: string): boolean {
        const ignorePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'];
        return ignorePatterns.some(pattern => minimatch(relPath, pattern, { dot: true }));
    }

    private isIndexable(relPath: string): boolean {
        const ext = path.extname(relPath).toLowerCase();
        const allowed = new Set([
            // TypeScript / JavaScript
            '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
            // Python
            '.py', '.pyi',
            // Flutter / Dart
            '.dart', '.arb',
            // Go
            '.go',
            // Rust
            '.rs',
            // Java / Kotlin / Scala
            '.java', '.kt', '.kts', '.scala',
            // C / C++
            '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
            // .NET (C# / F#)
            '.cs', '.fs',
            // Swift / Objective-C
            '.swift', '.m',
            // Ruby
            '.rb', '.rake', '.gemspec',
            // PHP
            '.php',
            // Elixir / Erlang
            '.ex', '.exs', '.erl',
            // Haskell / OCaml
            '.hs', '.ml',
            // Lua
            '.lua',
            // R
            '.r', '.R',
            // SQL
            '.sql',
            // Shell
            '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
            // Web frameworks
            '.vue', '.svelte', '.astro',
            // Web / Styles
            '.html', '.css', '.scss', '.sass', '.less',
            // Config / Data
            '.json', '.yaml', '.yml', '.toml', '.xml', '.plist', '.gradle',
            // API schemas
            '.graphql', '.gql', '.proto',
            // DevOps
            '.tf', '.hcl',
            // Documentation
            '.md', '.mdx', '.txt', '.rst',
        ]);
        // Also index known filenames without extensions
        const basename = path.basename(relPath);
        const specialFiles = new Set([
            'Dockerfile', 'Makefile', 'Jenkinsfile', 'Vagrantfile',
            'Gemfile', 'Rakefile', '.env.example', '.editorconfig',
        ]);
        return allowed.has(ext) || specialFiles.has(basename);
    }

    /**
     * Search the local index.
     */
    async search(query: string, options: SearchOptions = {}): Promise<any[]> {
        const topK = options.topK || 10;
        const results = await this.store.search(query, topK);

        // Map to internal format
        return results.map(r => ({
            path: path.relative(this.workspacePath, r.chunk.filePath),
            content: r.chunk.content,
            score: r.score,
            lines: `${r.chunk.startLine}-${r.chunk.endLine}`
        }));
    }

    async chat(message: string, context?: any): Promise<string> {
        const ollama = getOllamaProvider();
        const available = await ollama.isAvailable();

        if (!available) {
            return "[Local Context Engine] Ollama LLM is not available. Please ensure Ollama is running (ollama serve) and a model is downloaded (ollama pull qwen2.5-coder:7b).";
        }

        try {
            const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
                {
                    role: 'system',
                    content: 'You are a helpful code assistant with access to a local codebase. Provide concise, accurate answers.'
                },
                { role: 'user', content: message }
            ];
            return await ollama.chat(messages);
        } catch (err: any) {
            console.error('[LocalContextService] Ollama chat error:', err.message);
            return `[Local Context Engine] LLM generation failed: ${err.message}`;
        }
    }

    /**
     * RAG-powered searchAndAsk — searches local index for context,
     * then uses Ollama LLM to generate a grounded answer.
     * Falls back to retrieval-only if Ollama is not available.
     */
    async searchAndAsk(query: string, prompt?: string, options?: any): Promise<string> {
        // Step 1: Retrieve relevant context from local index
        const results = await this.search(query, { topK: 5 });
        const context = results.map(r => `File: ${r.path}\nContent:\n${r.content}`).join('\n\n');

        // Step 2: Try Ollama LLM generation
        const ollama = getOllamaProvider();
        const available = await ollama.isAvailable();

        if (!available) {
            // Fallback: return raw search results
            console.error('[LocalContextService] Ollama not available, returning retrieval-only results.');
            return `[Local Context - Retrieval Only]\n\n${context}\n\n(Note: Install and run Ollama for AI-powered answers: ollama serve && ollama pull qwen2.5-coder:7b)`;
        }

        try {
            return await ollama.searchAndAsk(query, context, prompt);
        } catch (err: any) {
            console.error('[LocalContextService] Ollama searchAndAsk error:', err.message);
            return `[Local Context - Retrieval Only]\n\n${context}\n\n(LLM generation failed: ${err.message})`;
        }
    }

    async exportToFile(filePath: string): Promise<void> {
        // We ignore the specific path for now and save to default .local-context location
        // or we could copy the internal index file to destination.
        // Ideally we respect the path.
        console.error(`[LocalContextService] Exporting to ${filePath} (mocked - internal store auto-saves)`);
        await this.store.save();
    }
}
