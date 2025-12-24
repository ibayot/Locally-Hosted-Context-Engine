/**
 * Status Endpoint
 * 
 * Returns index status information.
 */

import type { Router } from 'express';
import { Router as createRouter } from 'express';
import type { ContextServiceClient } from '../../mcp/serviceClient.js';

/**
 * Create status router.
 * 
 * Endpoints:
 * - GET /api/v1/status - Returns index status
 */
export function createStatusRouter(serviceClient: ContextServiceClient): Router {
    const router = createRouter();

    router.get('/status', (_req, res) => {
        try {
            const status = serviceClient.getIndexStatus();
            res.json(status);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: message });
        }
    });

    return router;
}
