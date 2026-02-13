/**
 * Migration script from v1.2 to v1.3
 * 
 * Converts JSON-based index to SQLite + HNSW format
 * 
 * Usage:
 *   npm run migrate
 */

import * as fs from 'fs';
import * as path from 'path';
import { SQLiteVectorStore } from '../src/local/sqliteStore.js';
import { LocalEmbeddingService } from '../src/local/embedding.js';
import { log } from '../src/utils/logger.js';

interface V12Chunk {
  id: string;
  content: string;
  embedding: number[];
  metadata?: {
    path: string;
    startLine?: number;
    endLine?: number;
  };
}

interface V12State {
  chunks: V12Chunk[];
  files?: Record<string, { hash: string; indexed_at: number }>;
}

async function migrateWorkspace(workspacePath: string) {
  log.info('Starting migration from v1.2 to v1.3...', { workspace: workspacePath });

  // 1. Check for v1.2 state file
  const v12StatePath = path.join(workspacePath, '.augment-context-state.json');
  if (!fs.existsSync(v12StatePath)) {
    log.error('No v1.2 state file found. Nothing to migrate.');
    process.exit(1);
  }

  // 2. Backup v1.2 state
  const backupPath = `${v12StatePath}.v12.backup`;
  fs.copyFileSync(v12StatePath, backupPath);
  log.info('Backed up v1.2 state', { backup: backupPath });

  // 3. Load v1.2 state
  const v12State: V12State = JSON.parse(fs.readFileSync(v12StatePath, 'utf-8'));
  log.info('Loaded v1.2 state', { chunks: v12State.chunks.length });

  // 4. Initialize v1.3 systems
  const embeddingService = LocalEmbeddingService.getInstance();
  embeddingService.configure(workspacePath);
  await embeddingService.init();
  log.info('Initialized embedding service');

  const sqliteStore = new SQLiteVectorStore(workspacePath);
  log.info('Initialized SQLite vector store');

  // 5. Migrate chunks
  const fileChunks = new Map<string, Array<{
    content: string;
    startLine: number;
    endLine: number;
    embedding: number[];
    type: 'file' | 'definition' | 'block';
  }>>();

  for (const chunk of v12State.chunks) {
    const filePath = chunk.metadata?.path || 'unknown';
    
    if (!fileChunks.has(filePath)) {
      fileChunks.set(filePath, []);
    }

    fileChunks.get(filePath)!.push({
      content: chunk.content,
      startLine: chunk.metadata?.startLine || 1,
      endLine: chunk.metadata?.endLine || 1,
      embedding: chunk.embedding,
      type: 'block', // v1.2 didn't have chunk types
    });
  }

  log.info('Grouped chunks by file', { files: fileChunks.size });

  // 6. Insert into SQLite
  let migratedFiles = 0;
  let migratedChunks = 0;

  for (const [filePath, chunks] of fileChunks.entries()) {
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(workspacePath, filePath);

      let fileHash = 'unknown';
      if (fs.existsSync(absolutePath)) {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const crypto = await import('crypto');
        fileHash = crypto.createHash('sha256').update(content).digest('hex');
      }

      await sqliteStore.addFile(absolutePath, chunks, fileHash);
      migratedFiles++;
      migratedChunks += chunks.length;

      if (migratedFiles % 100 === 0) {
        log.info(`Progress: ${migratedFiles} files, ${migratedChunks} chunks`);
      }
    } catch (error) {
      log.error(`Failed to migrate file: ${filePath}`, { error: String(error) });
    }
  }

  // 7. Save SQLite store
  await sqliteStore.save();
  log.info('Migration complete', {
    files: migratedFiles,
    chunks: migratedChunks,
  });

  // 8. Rename old state file (don't delete - keep as backup)
  const archivePath = `${v12StatePath}.archived`;
  fs.renameSync(v12StatePath, archivePath);
  log.info('Archived v1.2 state file', { archive: archivePath });

  log.info('✅ Migration successful!');
  log.info('Next steps:');
  log.info('1. Test the migrated index with: npm run build && npm start');
  log.info('2. If successful, you can delete the backup files');
  log.info(`   - ${backupPath}`);
  log.info(`   - ${archivePath}`);
}

// CLI entry point
const workspacePath = process.argv[2] || process.cwd();

migrateWorkspace(workspacePath)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log.error('Migration failed', { error: String(error) });
    process.exit(1);
  });
