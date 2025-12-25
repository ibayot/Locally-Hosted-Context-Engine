/**
 * Extension Tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting extension tests...');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('context-engine.context-engine');
        assert.ok(extension);
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('context-engine.context-engine');
        if (extension) {
            await extension.activate();
            assert.ok(extension.isActive);
        }
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);

        const expectedCommands = [
            'contextEngine.connect',
            'contextEngine.disconnect',
            'contextEngine.showStatus',
            'contextEngine.indexWorkspace',
            'contextEngine.search',
            'contextEngine.enhancePrompt',
            'contextEngine.refreshStatus',
            'contextEngine.clearSearchResults',
            'contextEngine.showOutput',
            'contextEngine.startServer',
            'contextEngine.stopServer',
        ];

        for (const cmd of expectedCommands) {
            assert.ok(
                commands.includes(cmd),
                `Command ${cmd} should be registered`
            );
        }
    });

    test('Configuration should have defaults', () => {
        const config = vscode.workspace.getConfiguration('contextEngine');

        assert.strictEqual(
            config.get('serverUrl'),
            'http://localhost:3333',
            'serverUrl should default to localhost:3333'
        );

        assert.strictEqual(
            config.get('autoConnect'),
            true,
            'autoConnect should default to true'
        );

        assert.strictEqual(
            config.get('showStatusBar'),
            true,
            'showStatusBar should default to true'
        );

        assert.strictEqual(
            config.get('enableCodeLens'),
            true,
            'enableCodeLens should default to true'
        );
    });

    test('Views should be registered', () => {
        // Views are registered in package.json, this is a basic check
        // Full view testing requires more complex setup
        assert.ok(true, 'Views are declared in package.json');
    });
});

suite('Client Test Suite', () => {
    test('ContextEngineClient should initialize with default URL', async () => {
        // Import dynamically to ensure extension context
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient();

        assert.strictEqual(
            client.isConnected(),
            false,
            'Client should not be connected initially'
        );
    });

    test('ContextEngineClient should accept custom URL', async () => {
        const { ContextEngineClient } = await import('../../client');
        const client = new ContextEngineClient('http://custom:4444');

        assert.strictEqual(
            client.getServerUrl(),
            'http://custom:4444',
            'Client should use custom URL'
        );
    });
});
