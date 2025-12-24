/**
 * Health Endpoint
 * 
 * Simple health check for server availability.
 */

import type { Router } from 'express';
import { Router as createRouter } from 'express';

/**
 * Create health check router.
 * 
 * Endpoints:
 * - GET /health - Returns server health status
 */
export function createHealthRouter(version: string): Router {
    const router = createRouter();

    router.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            version,
            timestamp: new Date().toISOString(),
        });
    });

    return router;
}
