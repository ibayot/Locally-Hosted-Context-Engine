/**
 * Request/Response Logging Middleware
 * 
 * Logs HTTP requests for debugging and monitoring.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Logging middleware that logs request details to stderr.
 * Uses stderr to avoid interfering with stdio transport.
 */
export function loggingMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const start = Date.now();

    // Log request
    console.error(`[HTTP] ${req.method} ${req.path}`);

    // Log response on finish
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.error(
            `[HTTP] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
        );
    });

    next();
}
