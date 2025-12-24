/**
 * CORS Middleware Configuration
 * 
 * Allows VS Code extension and other HTTP clients to access the API.
 */

import cors from 'cors';
import type { CorsOptions } from 'cors';

/**
 * CORS configuration for the HTTP server.
 * Allows requests from VS Code webviews and localhost development.
 */
export const corsOptions: CorsOptions = {
    // Allow VS Code webview origins and localhost for development
    origin: (origin, callback) => {
        // Allow requests with no origin (same-origin, curl, etc.)
        if (!origin) {
            callback(null, true);
            return;
        }

        // Allow VS Code webview origins
        if (origin.startsWith('vscode-webview://')) {
            callback(null, true);
            return;
        }

        // Allow localhost for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            callback(null, true);
            return;
        }

        // Deny other origins
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 hours
};

/**
 * Create configured CORS middleware
 */
export function createCorsMiddleware() {
    return cors(corsOptions);
}
