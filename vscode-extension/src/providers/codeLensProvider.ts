/**
 * CodeLens Provider
 * 
 * Provides inline actions in the editor for Context Engine features.
 */

import * as vscode from 'vscode';
import { ContextEngineClient } from '../client';

/**
 * CodeLens that shows "Search with Context Engine" on function/class definitions.
 */
export class ContextEngineCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    private client: ContextEngineClient;
    private enabled: boolean = true;

    constructor(client: ContextEngineClient) {
        this.client = client;
    }

    /**
     * Enable or disable CodeLens.
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this._onDidChangeCodeLenses.fire();
    }

    /**
     * Refresh CodeLens display.
     */
    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    /**
     * Provide CodeLens items for the document.
     */
    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        if (!this.enabled || !this.client.isConnected()) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Patterns for different languages
        const patterns = this.getPatternsForLanguage(document.languageId);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            for (const pattern of patterns) {
                const match = line.match(pattern.regex);
                if (match) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    const name = match[pattern.nameGroup] || match[1] || 'this';

                    // Search CodeLens
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: '$(search) Find Related Code',
                        command: 'contextEngine.searchFromCodeLens',
                        arguments: [name, document.uri],
                        tooltip: `Search for code related to "${name}"`,
                    }));

                    // Context CodeLens
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: '$(book) Get Context',
                        command: 'contextEngine.getContextFromCodeLens',
                        arguments: [name, document.uri],
                        tooltip: `Get context for "${name}"`,
                    }));
                }
            }
        }

        return codeLenses;
    }

    /**
     * Get regex patterns for the given language.
     */
    private getPatternsForLanguage(languageId: string): Array<{ regex: RegExp; nameGroup: number }> {
        switch (languageId) {
            case 'typescript':
            case 'typescriptreact':
            case 'javascript':
            case 'javascriptreact':
                return [
                    // Function declarations: function name(...) or async function name(...)
                    { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, nameGroup: 1 },
                    // Arrow functions: const name = (...) => or const name = async (...) =>
                    { regex: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/, nameGroup: 1 },
                    // Class declarations
                    { regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, nameGroup: 1 },
                    // Methods: name(...) { or async name(...) {
                    { regex: /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/, nameGroup: 1 },
                    // Interface/Type declarations
                    { regex: /^\s*(?:export\s+)?(?:interface|type)\s+(\w+)/, nameGroup: 1 },
                ];

            case 'python':
                return [
                    // Function definitions: def name(...)
                    { regex: /^\s*(?:async\s+)?def\s+(\w+)/, nameGroup: 1 },
                    // Class definitions
                    { regex: /^\s*class\s+(\w+)/, nameGroup: 1 },
                ];

            case 'go':
                return [
                    // Function definitions: func name(...) or func (r Receiver) name(...)
                    { regex: /^\s*func\s+(?:\([^)]+\)\s+)?(\w+)/, nameGroup: 1 },
                    // Type definitions
                    { regex: /^\s*type\s+(\w+)\s+(?:struct|interface)/, nameGroup: 1 },
                ];

            case 'rust':
                return [
                    // Function definitions: fn name(...) or pub fn name(...)
                    { regex: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, nameGroup: 1 },
                    // Struct/Enum definitions
                    { regex: /^\s*(?:pub\s+)?(?:struct|enum)\s+(\w+)/, nameGroup: 1 },
                    // Impl blocks
                    { regex: /^\s*impl(?:<[^>]+>)?\s+(\w+)/, nameGroup: 1 },
                ];

            case 'java':
            case 'kotlin':
                return [
                    // Class definitions
                    { regex: /^\s*(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)/, nameGroup: 1 },
                    // Method definitions
                    { regex: /^\s*(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\(/, nameGroup: 1 },
                    // Interface definitions
                    { regex: /^\s*(?:public)?\s*interface\s+(\w+)/, nameGroup: 1 },
                ];

            case 'csharp':
                return [
                    // Class definitions
                    { regex: /^\s*(?:public|private|protected|internal)?\s*(?:abstract|sealed|static)?\s*class\s+(\w+)/, nameGroup: 1 },
                    // Method definitions
                    { regex: /^\s*(?:public|private|protected|internal)?\s*(?:static|async|virtual|override)?\s*\w+\s+(\w+)\s*\(/, nameGroup: 1 },
                ];

            case 'dart':
                return [
                    // Class definitions
                    { regex: /^\s*(?:abstract\s+)?class\s+(\w+)/, nameGroup: 1 },
                    // Function definitions
                    { regex: /^\s*(?:Future<[^>]+>|void|bool|int|String|double|\w+)\s+(\w+)\s*\(/, nameGroup: 1 },
                ];

            default:
                return [];
        }
    }
}
