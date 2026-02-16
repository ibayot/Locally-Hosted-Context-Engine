/**
 * Worker thread for parallel embedding generation
 * Offloads CPU-intensive embedding from main thread
 */

import { parentPort, workerData } from 'worker_threads';
import { pipeline, env as transformersEnv } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';

// Allow remote models if cache is empty (first run)
const modelCacheExists = workerData.cacheDir && fs.existsSync(workerData.cacheDir);
if (modelCacheExists) {
  // Model already downloaded, use local only
  transformersEnv.allowRemoteModels = false;
} else {
  // First run, allow download
  transformersEnv.allowRemoteModels = true;
}

interface EmbeddingTask {
  id: string;
  text: string;
}

interface EmbeddingResult {
  id: string;
  embedding: number[];
}

let embeddingPipeline: any = null;

async function initializePipeline() {
  if (!embeddingPipeline) {
    const modelName = workerData.model || 'Xenova/all-MiniLM-L6-v2';
    embeddingPipeline = await pipeline('feature-extraction', modelName, {
      cache_dir: workerData.cacheDir,
    });
  }
}

async function processTask(task: EmbeddingTask): Promise<EmbeddingResult> {
  await initializePipeline();
  
  const output = await embeddingPipeline(task.text, {
    pooling: 'mean',
    normalize: true,
  });
  
  const embedding = Array.from(output.data as Float32Array);
  
  return {
    id: task.id,
    embedding,
  };
}

// Listen for tasks from main thread
parentPort?.on('message', async (task: EmbeddingTask) => {
  try {
    const result = await processTask(task);
    parentPort?.postMessage({ success: true, result });
  } catch (error) {
    parentPort?.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      id: task.id,
    });
  }
});

// Signal ready
parentPort?.postMessage({ ready: true });
