import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration_ms: number;
}

export async function runCommand(args: {
  command: string;
  commandArgs: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<CommandResult> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(args.command, args.commandArgs, {
      cwd: args.cwd,
      timeout: args.timeoutMs,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), exitCode: 0, duration_ms: Date.now() - start };
  } catch (err: any) {
    const stdout = String(err?.stdout ?? '');
    const stderr = String(err?.stderr ?? '');
    const code = typeof err?.code === 'number' ? err.code : 1;
    return { stdout, stderr, exitCode: code, duration_ms: Date.now() - start };
  }
}

export function devNullPath(): string {
  return process.platform === 'win32' ? 'NUL' : '/dev/null';
}

