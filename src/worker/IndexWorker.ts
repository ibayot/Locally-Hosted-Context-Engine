import { parentPort, workerData } from 'worker_threads';
import { WorkerPayload, WorkerMessage } from './messages.js';
import { ContextServiceClient } from '../mcp/serviceClient.js';

export async function runIndexJob(
  payload: WorkerPayload,
  send: (message: WorkerMessage) => void
): Promise<void> {
  if (payload.mock) {
    send({ type: 'index_complete', duration: 0, count: 0 });
    return;
  }

  send({
    type: 'index_start',
    files: payload.files ?? [],
  });

  try {
    const client = new ContextServiceClient(payload.workspacePath);
    const result = payload.files?.length
      ? await client.indexFiles(payload.files)
      : await client.indexWorkspace();

    send({
      type: 'index_complete',
      duration: result.duration,
      count: result.indexed,
      errors: result.errors,
    });
  } catch (error) {
    send({
      type: 'index_error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const port = parentPort;
if (port && workerData) {
  void runIndexJob(workerData as WorkerPayload, (message) => port.postMessage(message));
}
