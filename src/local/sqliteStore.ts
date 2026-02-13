/**
 * SQLite-based vector store with HNSW index
 * Replaces JSON-based storage for better performance and scalability
 * 
 * Note: Requires native modules (better-sqlite3, hnswlib-node) which need C++ build tools on Windows.
 * Falls back to LocalVectorStore if native modules are unavailable.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../utils/logger.js';
import { HierarchicalChunker, type HierarchicalChunk } from './hierarchicalChunker.js';
import { featureEnabled } from '../config/features.js';

// Dynamic imports for native modules with fallback
let Database: any = null;
let HierarchicalNSW: any = null;
export let nativeModulesAvailable = false;

try {
  const sqlite3Module = await import('better-sqlite3');
  Database = sqlite3Module.default;
  // @ts-ignore - optional dependency, may not be available without C++ build tools
  const hnswModule = await import('hnswlib-node');
  HierarchicalNSW = hnswModule.HierarchicalNSW;
  nativeModulesAvailable = true;
  log.info('Native modules loaded successfully (SQLite + HNSW)');
} catch (error) {
  log.warn('Native modules not available - SQLite/HNSW features disabled', { 
    error: error instanceof Error ? error.message : String(error),
    hint: 'Install Visual Studio Build Tools or disable CE_USE_SQLITE/CE_USE_HNSW'
  });
}

export interface Chunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  embedding: number[];
  type: 'definition' | 'block' | 'file';
  symbolName?: string;
  hash: string;
}

export interface SearchResult {
  chunk: Chunk;
  similarity: number;
}

export class SQLiteVectorStore {
  private db: any;
  private index: any;
  private dimension: number;
  private maxElements: number;
  private workspacePath: string;
  private chunkIdToIndex: Map<string, number> = new Map();
  private indexToChunkId: Map<number, string> = new Map();
  private nextIndex: number = 0;
  private chunker: HierarchicalChunker | null = null;

  constructor(workspacePath: string, dimension: number = 384, maxElements: number = 100000) {
    if (!nativeModulesAvailable) {
      throw new Error('SQLiteVectorStore requires native modules (better-sqlite3, hnswlib-node). Install Visual Studio Build Tools or use LocalVectorStore instead.');
    }

    this.workspacePath = workspacePath;
    this.dimension = dimension;
    this.maxElements = maxElements;

    // Initialize hierarchical chunker if enabled
    if (featureEnabled('use_hierarchical_chunks')) {
      this.chunker = new HierarchicalChunker();
      log.info('Hierarchical chunker enabled');
    }

    // Initialize SQLite database
    const dbPath = path.join(workspacePath, '.augment-context', 'vectors.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    
    // Create tables
    this.initializeTables();

    // Initialize HNSW index
    this.index = new HierarchicalNSW('cosine', dimension);
    this.index.initIndex(maxElements);
    
    // Load existing data
    this.loadFromDatabase();
    
    log.info('SQLite vector store initialized', {
      dimension,
      maxElements,
      dbPath
    });
  }

  private initializeTables(): void {
    // Chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        type TEXT NOT NULL,
        symbol_name TEXT,
        hash TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Embeddings table (separate for efficient vector ops)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      )
    `);

    // File metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
        chunk_count INTEGER DEFAULT 0
      )
    `);

    // Indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(type);
      CREATE INDEX IF NOT EXISTS idx_chunks_symbol ON chunks(symbol_name);
      CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
    `);
  }

  private loadFromDatabase(): void {
    const chunks = this.db.prepare('SELECT id FROM chunks ORDER BY rowid').all() as { id: string }[];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = chunks[i].id;
      this.chunkIdToIndex.set(chunkId, i);
      this.indexToChunkId.set(i, chunkId);
      
      // Load embedding and add to HNSW index
      const row = this.db.prepare('SELECT embedding FROM embeddings WHERE chunk_id = ?').get(chunkId) as { embedding: Buffer } | undefined;
      if (row) {
        const embedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, this.dimension);
        this.index.addPoint(Array.from(embedding), i);
      }
    }
    
    this.nextIndex = chunks.length;
    log.info('Loaded chunks from database', { count: chunks.length });
  }

  async addFile(filePath: string, chunks: Omit<Chunk, 'id' | 'hash'>[], fileHash: string): Promise<void> {
    const relativePath = path.relative(this.workspacePath, filePath);
    
    // Check if file needs reindexing
    const existingFile = this.db.prepare('SELECT hash FROM files WHERE path = ?').get(relativePath) as { hash: string } | undefined;
    if (existingFile?.hash === fileHash) {
      log.debug('Skipping unchanged file', { path: relativePath });
      return;
    }

    // Remove old chunks if file exists
    if (existingFile) {
      await this.removeFile(relativePath);
    }

    // Insert new chunks
    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (id, file_path, content, start_line, end_line, type, symbol_name, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertEmbedding = this.db.prepare(`
      INSERT INTO embeddings (chunk_id, embedding)
      VALUES (?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const chunk of chunks) {
        const chunkId = `${relativePath}:${chunk.startLine}-${chunk.endLine}`;
        const hash = crypto.createHash('sha256').update(chunk.content).digest('hex');
        
        insertChunk.run(
          chunkId,
          relativePath,
          chunk.content,
          chunk.startLine,
          chunk.endLine,
          chunk.type,
          chunk.symbolName || null,
          hash
        );

        // Store embedding as blob
        const embeddingBuffer = Buffer.from(new Float32Array(chunk.embedding).buffer);
        insertEmbedding.run(chunkId, embeddingBuffer);

        // Add to HNSW index
        const index = this.nextIndex++;
        this.index.addPoint(chunk.embedding, index);
        this.chunkIdToIndex.set(chunkId, index);
        this.indexToChunkId.set(index, chunkId);
      }

      // Update file metadata
      this.db.prepare(`
        INSERT OR REPLACE INTO files (path, hash, chunk_count, indexed_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
      `).run(relativePath, fileHash, chunks.length);
    });

    transaction();
    log.debug('Indexed file', { path: relativePath, chunks: chunks.length });
  }

  async removeFile(filePath: string): Promise<void> {
    const relativePath = path.relative(this.workspacePath, filePath);
    
    // Get chunks to remove
    const chunks = this.db.prepare('SELECT id FROM chunks WHERE file_path = ?').all(relativePath) as { id: string }[];
    
    // Remove from HNSW index
    for (const { id } of chunks) {
      const index = this.chunkIdToIndex.get(id);
      if (index !== undefined) {
        this.chunkIdToIndex.delete(id);
        this.indexToChunkId.delete(index);
        // Note: HNSW doesn't support deletion, but we can rebuild periodically
      }
    }

    // Delete from database (cascade deletes embeddings)
    this.db.prepare('DELETE FROM chunks WHERE file_path = ?').run(relativePath);
    this.db.prepare('DELETE FROM files WHERE path = ?').run(relativePath);
    
    log.debug('Removed file', { path: relativePath, chunks: chunks.length });
  }

  search(queryEmbedding: number[], topK: number = 10): SearchResult[] {
    if (this.nextIndex === 0) {
      return [];
    }

    // Search HNSW index
    const result = this.index.searchKnn(queryEmbedding, Math.min(topK, this.nextIndex));
    
    // Fetch chunks from database
    const results: SearchResult[] = [];
    const getChunk = this.db.prepare(`
      SELECT c.*, e.embedding
      FROM chunks c
      JOIN embeddings e ON c.id = e.chunk_id
      WHERE c.id = ?
    `);

    for (let i = 0; i < result.neighbors.length; i++) {
      const index = result.neighbors[i];
      const similarity = 1 - result.distances[i]; // Convert distance to similarity
      const chunkId = this.indexToChunkId.get(index);
      
      if (chunkId) {
        const row = getChunk.get(chunkId) as any;
        if (row) {
          const embedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, this.dimension);
          results.push({
            chunk: {
              id: row.id,
              filePath: row.file_path,
              content: row.content,
              startLine: row.start_line,
              endLine: row.end_line,
              embedding: Array.from(embedding),
              type: row.type,
              symbolName: row.symbol_name,
              hash: row.hash
            },
            similarity
          });
        }
      }
    }

    return results;
  }

  getFileHash(filePath: string): string | null {
    const relativePath = path.relative(this.workspacePath, filePath);
    const row = this.db.prepare('SELECT hash FROM files WHERE path = ?').get(relativePath) as { hash: string } | undefined;
    return row?.hash || null;
  }

  getIndexedFilesCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    return row.count;
  }

  getChunksCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
    return row.count;
  }

  async save(): Promise<void> {
    // SQLite auto-saves, but we can optimize here
    this.db.pragma('optimize');
    this.db.checkpoint();
    log.debug('Database optimized and checkpointed');
  }

  close(): void {
    this.db.close();
    log.info('SQLite vector store closed');
  }

  // Rebuild HNSW index (call periodically if many deletions)
  async rebuildIndex(): Promise<void> {
    log.info('Rebuilding HNSW index...');
    
    this.index = new HierarchicalNSW('cosine', this.dimension);
    this.index.initIndex(this.maxElements);
    this.chunkIdToIndex.clear();
    this.indexToChunkId.clear();
    this.nextIndex = 0;
    
    this.loadFromDatabase();
    log.info('HNSW index rebuilt');
  }

  /**
   * Add file using content string (will create chunks using hierarchical chunker if enabled)
   * This is the high-level API that serviceClient should use
   */
  async addFileFromContent(filePath: string, content: string, embedFn: (text: string) => Promise<number[]>): Promise<void> {
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    
    // Create chunks
    let chunkData: Omit<Chunk, 'id' | 'hash'>[];
    
    if (this.chunker) {
      // Use hierarchical chunker
      const hierarchicalChunks = this.chunker.createChunks(content, filePath);
      
      // Convert to Chunk format with embeddings
      chunkData = await Promise.all(
        hierarchicalChunks.map(async (hc) => ({
          filePath,
          content: hc.content,
          startLine: hc.startLine,
          endLine: hc.endLine,
          embedding: await embedFn(hc.content),
          type: (hc.level === 0 ? 'file' : hc.level === 1 || hc.level === 2 ? 'definition' : 'block') as Chunk['type'],
          symbolName: hc.symbolName
        }))
      );
    } else {
      // Fallback: simple line-based chunking
      const lines = content.split('\\n');
      const chunkSize = 50;
      chunkData = [];
      
      for (let i = 0; i < lines.length; i += chunkSize) {
        const chunkLines = lines.slice(i, i + chunkSize);
        const chunkContent = chunkLines.join('\\n');
        chunkData.push({
          filePath,
          content: chunkContent,
          startLine: i + 1,
          endLine: Math.min(i + chunkSize, lines.length),
          embedding: await embedFn(chunkContent),
          type: 'block'
        });
      }
    }
    
    await this.addFile(filePath, chunkData, fileHash);
  }
}

