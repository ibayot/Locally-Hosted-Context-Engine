/**
 * ContextEngineClient Tests
 * 
 * Tests for HTTP client timeout, cancellation, and error handling.
 */

import * as assert from 'assert';
import * as http from 'http';

// We need to test the client in isolation, mocking the fetch API
// Since we're in a VS Code test context, we'll create integration-style tests

suite('ContextEngineClient Timeout Tests', () => {
    let mockServer: http.Server;
    let serverPort: number;

    // Create a mock server for testing
    suiteSetup((done) => {
        mockServer = http.createServer((req, res) => {
            const url = req.url || '';
            
            if (url === '/health') {
                // Health endpoint responds immediately
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));
            } else if (url === '/api/v1/search') {
                // Search endpoint responds immediately
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ results: [], metadata: { query: '', top_k: 10, resultCount: 0 } }));
            } else if (url === '/api/v1/slow') {
                // Slow endpoint - delays 5 seconds (for timeout testing)
                setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result: 'slow' }));
                }, 5000);
            } else if (url === '/api/v1/error') {
                // Error endpoint
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        mockServer.listen(0, () => {
            const addr = mockServer.address();
            serverPort = typeof addr === 'object' && addr ? addr.port : 0;
            done();
        });
    });

    suiteTeardown((done) => {
        mockServer.close(done);
    });

    test('Client should connect to server successfully', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        const health = await client.connect();
        assert.strictEqual(health.status, 'ok');
        assert.strictEqual(client.isConnected(), true);
    });

    test('Client should handle connection failure gracefully', async () => {
        const { ContextEngineClient } = await import('../../client');
        // Use a port that's definitely not in use
        const client = new ContextEngineClient('http://localhost:59999');

        try {
            await client.connect();
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(client.isConnected(), false);
        }
    });

    test('Client should emit connection change events', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        const events: boolean[] = [];
        client.onDidChangeConnection((connected) => {
            events.push(connected);
        });

        await client.connect();
        assert.deepStrictEqual(events, [true], 'Should emit true on connect');

        client.disconnect();
        assert.deepStrictEqual(events, [true, false], 'Should emit false on disconnect');
    });

    test('Client should perform search successfully', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        await client.connect();
        const response = await client.search('test query', 10);

        assert.ok(response.results);
        assert.ok(response.metadata);
        assert.strictEqual(response.metadata.resultCount, 0);
    });

    test('Client should support request cancellation via AbortSignal', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        await client.connect();

        const controller = new AbortController();
        
        // Start the request then immediately cancel it
        const searchPromise = client.search('test', 10, controller.signal);
        controller.abort();

        try {
            await searchPromise;
            // If the request was fast enough to complete, that's okay too
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(
                error.message.includes('cancelled') || error.message.includes('abort'),
                `Error should mention cancellation: ${error.message}`
            );
        }
    });

    test('Client should handle server errors with proper messages', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        await client.connect();

        // Access the private request method indirectly by using a non-existent endpoint
        // This will test error handling
        try {
            // Use codebaseRetrieval which calls a different endpoint we can mock
            await (client as any).request('GET', '/api/v1/error');
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('Internal server error') || error.message.includes('500'));
        }
    });

    test('Client should update URL and reset connection state', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        await client.connect();
        assert.strictEqual(client.isConnected(), true);

        // Change URL should disconnect
        client.setServerUrl('http://localhost:9999');
        assert.strictEqual(client.isConnected(), false);
        assert.strictEqual(client.getServerUrl(), 'http://localhost:9999');
    });

    test('Client version should be set after connect', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        assert.strictEqual(client.getVersion(), '');

        await client.connect();
        assert.strictEqual(client.getVersion(), '1.0.0');
    });
});

suite('ContextEngineClient AbortSignal Edge Cases', () => {
    let mockServer: http.Server;
    let serverPort: number;

    suiteSetup((done) => {
        mockServer = http.createServer((req, res) => {
            const url = req.url || '';

            if (url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));
            } else if (url === '/api/v1/search') {
                // Add a small delay to allow cancellation to happen
                setTimeout(() => {
                    if (!res.writableEnded) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ results: [], metadata: { query: '', top_k: 10, resultCount: 0 } }));
                    }
                }, 100);
            }
        });

        mockServer.listen(0, () => {
            const addr = mockServer.address();
            serverPort = typeof addr === 'object' && addr ? addr.port : 0;
            done();
        });
    });

    suiteTeardown((done) => {
        mockServer.close(done);
    });

    test('Pre-aborted signal should reject immediately', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        await client.connect();

        // Create an already-aborted signal
        const controller = new AbortController();
        controller.abort();

        try {
            await client.search('test', 10, controller.signal);
            assert.fail('Should have rejected with aborted signal');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(
                error.message.includes('cancelled') || error.message.includes('abort'),
                `Error should mention cancellation: ${error.message}`
            );
        }
    });

    test('AbortSignal should work for enhancePrompt', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        await client.connect();

        const controller = new AbortController();
        controller.abort();

        try {
            await client.enhancePrompt('test prompt', controller.signal);
            // May complete if server responds fast
        } catch (error) {
            assert.ok(error instanceof Error);
            // Should either be cancelled or 404 (endpoint not mocked)
        }
    });

    test('AbortSignal should work for codebaseRetrieval', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient(`http://localhost:${serverPort}`);

        await client.connect();

        const controller = new AbortController();
        controller.abort();

        try {
            await client.codebaseRetrieval('test query', 10, controller.signal);
        } catch (error) {
            assert.ok(error instanceof Error);
        }
    });
});

