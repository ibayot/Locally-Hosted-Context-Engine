export type FileChangeType = 'add' | 'change' | 'unlink';

export interface FileChange {
  type: FileChangeType;
  path: string;
  timestamp: number;
}

export interface WatcherOptions {
  debounceMs?: number;      // Default: 500ms
  ignored?: (string | RegExp)[]; // Patterns to ignore (passed to chokidar)
  persistent?: boolean;     // Keep process alive
  maxBatchSize?: number;    // Default: 100
}

export interface WatcherHooks {
  onBatch: (changes: FileChange[]) => void | Promise<void>;
}
