/**
 * Structured logging with Pino
 * All logs go to stderr to avoid corrupting stdio MCP transport
 */

import pino from 'pino';

// Create logger instance configured for stderr
export const logger = pino({
  name: 'context-engine',
  level: process.env.LOG_LEVEL || (process.env.CE_DEBUG_INDEX === 'true' || process.env.CE_DEBUG_SEARCH === 'true' ? 'debug' : 'info'),
  // CRITICAL: Use stderr (fd 2) to avoid corrupting stdio MCP transport
  transport: {
    target: 'pino/file',
    options: { destination: 2 } // stderr
  },
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Convenience methods with context
export const log = {
  info: (msg: string, context?: object) => logger.info(context || {}, msg),
  error: (msg: string, context?: object) => logger.error(context || {}, msg),
  warn: (msg: string, context?: object) => logger.warn(context || {}, msg),
  debug: (msg: string, context?: object) => logger.debug(context || {}, msg),
  
  // Tool execution logging
  tool: (toolName: string, duration: number, success: boolean, error?: string) => {
    logger.info({
      tool: toolName,
      duration_ms: duration,
      success,
      error
    }, `Tool ${toolName} ${success ? 'completed' : 'failed'}`);
  },
  
  // Indexing logging
  indexing: (files: number, duration: number, operation: string) => {
    logger.info({
      operation,
      files_count: files,
      duration_ms: duration
    }, `Indexing ${operation}: ${files} files`);
  },
  
  // Search logging
  search: (query: string, results: number, duration: number) => {
    logger.info({
      query,
      results_count: results,
      duration_ms: duration
    }, `Search completed`);
  }
};
