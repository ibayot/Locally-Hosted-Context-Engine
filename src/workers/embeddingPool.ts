/**
 * Worker pool for parallel embedding generation
 * Distributes embedding tasks across multiple worker threads
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Task {
  id: string;
  text: string;
  resolve: (embedding: number[]) => void;
  reject: (error: Error) => void;
}

export class EmbeddingWorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Task[] = [];
  private activeWorkers = new Set<number>();
  private workerCount: number;
  private model: string;
  private cacheDir: string;

  constructor(model: string = 'Xenova/all-MiniLM-L6-v2', cacheDir: string = './.models', workerCount?: number) {
    this.model = model;
    this.cacheDir = cacheDir;
    // Use CPU count - 1, minimum 1, maximum 4 to avoid overwhelming laptop
    this.workerCount = workerCount || Math.min(Math.max(os.cpus().length - 1, 1), 4);
    
    log.info('Initializing embedding worker pool', {
      workers: this.workerCount,
      model,
    });
    
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    const workerPath = path.join(__dirname, 'embeddingWorker.js');
    
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(workerPath, {
        workerData: {
          model: this.model,
          cacheDir: this.cacheDir,
        },
      });

      worker.on('message', (msg) => {
        if (msg.ready) {
          log.debug('Worker ready', { workerId: i });
          this.processNextTask(i);
        } else if (msg.success) {
          this.handleTaskComplete(i, msg.result);
        } else {
          this.handleTaskError(i, new Error(msg.error));
        }
      });

      worker.on('error', (error) => {
        log.error('Worker error', { workerId: i, error: String(error) });
        this.handleTaskError(i, error);
      });

      this.workers[i] = worker;
    }
  }

  async embed(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const task: Task = {
        id: `${Date.now()}-${Math.random()}`,
        text,
        resolve,
        reject,
      };

      this.taskQueue.push(task);
      this.assignTasks();
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  private assignTasks(): void {
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.activeWorkers.has(i) && this.taskQueue.length > 0) {
        this.processNextTask(i);
      }
    }
  }

  private processNextTask(workerId: number): void {
    const task = this.taskQueue.shift();
    if (!task) {
      return;
    }

    this.activeWorkers.add(workerId);
    
    // Store current task for this worker
    (this.workers[workerId] as any).currentTask = task;
    
    this.workers[workerId].postMessage({
      id: task.id,
      text: task.text,
    });
  }

  private handleTaskComplete(workerId: number, result: { id: string; embedding: number[] }): void {
    const worker = this.workers[workerId];
    const task = (worker as any).currentTask as Task | undefined;
    
    if (task && task.id === result.id) {
      task.resolve(result.embedding);
      delete (worker as any).currentTask;
    }
    
    this.activeWorkers.delete(workerId);
    this.assignTasks();
  }

  private handleTaskError(workerId: number, error: Error): void {
    const worker = this.workers[workerId];
    const task = (worker as any).currentTask as Task | undefined;
    
    if (task) {
      task.reject(error);
      delete (worker as any).currentTask;
    }
    
    this.activeWorkers.delete(workerId);
    this.assignTasks();
  }

  async close(): Promise<void> {
    log.info('Closing embedding worker pool');
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = [];
    this.activeWorkers.clear();
    this.taskQueue = [];
  }

  getStats() {
    return {
      workers: this.workers.length,
      active: this.activeWorkers.size,
      queued: this.taskQueue.length,
    };
  }
}
