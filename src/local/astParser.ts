/**
 * Local AST-like Parser Service
 *
 * Provides symbol extraction and code structure analysis using
 * robust regex patterns for common languages. This provides immediate
 * value without requiring WASM grammar downloads.
 *
 * Supports: TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, C#, Ruby, PHP
 *
 * Future: Can be upgraded to use web-tree-sitter for true AST parsing.
 */

import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type SymbolKind =
    | 'class'
    | 'interface'
    | 'type'
    | 'enum'
    | 'function'
    | 'method'
    | 'property'
    | 'variable'
    | 'constant'
    | 'import'
    | 'export';

export interface CodeSymbol {
    name: string;
    kind: SymbolKind;
    filePath: string;
    startLine: number;
    endLine: number;
    signature: string;
    exported: boolean;
    parent?: string;       // e.g., class name for methods
}

export interface ImportInfo {
    source: string;        // Module path
    specifiers: string[];  // Named imports
    isDefault: boolean;
    isNamespace: boolean;  // import * as X
    line: number;
}

export interface FileAnalysis {
    filePath: string;
    symbols: CodeSymbol[];
    imports: ImportInfo[];
    exports: string[];
    complexity: {
        totalLines: number;
        codeLines: number;
        commentLines: number;
        blankLines: number;
    };
}

// ============================================================================
// Language Detection
// ============================================================================

type LanguageId = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'c' | 'csharp' | 'ruby' | 'php' | 'unknown';

const EXT_TO_LANG: Record<string, LanguageId> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.pyi': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java', '.kt': 'java', '.scala': 'java', // Similar enough syntax
    '.c': 'c', '.cpp': 'c', '.cc': 'c', '.h': 'c', '.hpp': 'c',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
};

// ============================================================================
// Parser Implementation
// ============================================================================

export class ASTParser {

    /**
     * Analyze a file and extract symbols, imports, and metrics.
     */
    analyze(filePath: string, content: string): FileAnalysis {
        const ext = path.extname(filePath).toLowerCase();
        const lang = EXT_TO_LANG[ext] || 'unknown';
        const lines = content.split('\n');

        const analysis: FileAnalysis = {
            filePath,
            symbols: [],
            imports: [],
            exports: [],
            complexity: this.countLines(lines),
        };

        if (lang === 'unknown') return analysis;

        // Extract imports
        analysis.imports = this.extractImports(lines, lang);

        // Extract symbols (functions, classes, etc.)
        analysis.symbols = this.extractSymbols(filePath, lines, lang);

        // Extract exports
        analysis.exports = analysis.symbols
            .filter(s => s.exported)
            .map(s => s.name);

        return analysis;
    }

    // --------------------------------------------------------------------------
    // Line counting
    // --------------------------------------------------------------------------

    private countLines(lines: string[]): FileAnalysis['complexity'] {
        let codeLines = 0;
        let commentLines = 0;
        let blankLines = 0;
        let inBlockComment = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === '') {
                blankLines++;
                continue;
            }

            // Block comment detection
            if (inBlockComment) {
                commentLines++;
                if (trimmed.includes('*/')) inBlockComment = false;
                continue;
            }

            if (trimmed.startsWith('/*')) {
                commentLines++;
                if (!trimmed.includes('*/')) inBlockComment = true;
                continue;
            }

            if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
                commentLines++;
                continue;
            }

            codeLines++;
        }

        return {
            totalLines: lines.length,
            codeLines,
            commentLines,
            blankLines,
        };
    }

    // --------------------------------------------------------------------------
    // Import extraction
    // --------------------------------------------------------------------------

    private extractImports(lines: string[], lang: LanguageId): ImportInfo[] {
        const imports: ImportInfo[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            switch (lang) {
                case 'typescript':
                case 'javascript': {
                    // import { X, Y } from 'module'
                    const namedMatch = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
                    if (namedMatch) {
                        imports.push({
                            specifiers: namedMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]),
                            source: namedMatch[2],
                            isDefault: false,
                            isNamespace: false,
                            line: i + 1,
                        });
                        continue;
                    }

                    // import X from 'module'
                    const defaultMatch = line.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
                    if (defaultMatch) {
                        imports.push({
                            specifiers: [defaultMatch[1]],
                            source: defaultMatch[2],
                            isDefault: true,
                            isNamespace: false,
                            line: i + 1,
                        });
                        continue;
                    }

                    // import * as X from 'module'
                    const nsMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
                    if (nsMatch) {
                        imports.push({
                            specifiers: [nsMatch[1]],
                            source: nsMatch[2],
                            isDefault: false,
                            isNamespace: true,
                            line: i + 1,
                        });
                        continue;
                    }

                    // const X = require('module')
                    const requireMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/);
                    if (requireMatch) {
                        imports.push({
                            specifiers: [requireMatch[1]],
                            source: requireMatch[2],
                            isDefault: true,
                            isNamespace: false,
                            line: i + 1,
                        });
                    }
                    break;
                }

                case 'python': {
                    // from X import Y, Z
                    const fromMatch = line.match(/from\s+(\S+)\s+import\s+(.+)/);
                    if (fromMatch) {
                        imports.push({
                            specifiers: fromMatch[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0]),
                            source: fromMatch[1],
                            isDefault: false,
                            isNamespace: false,
                            line: i + 1,
                        });
                        continue;
                    }

                    // import X
                    const importMatch = line.match(/^import\s+(\S+)(?:\s+as\s+\w+)?/);
                    if (importMatch) {
                        imports.push({
                            specifiers: [importMatch[1]],
                            source: importMatch[1],
                            isDefault: true,
                            isNamespace: false,
                            line: i + 1,
                        });
                    }
                    break;
                }

                case 'go': {
                    // import "module" or import alias "module"
                    const goImport = line.match(/^\s*(?:import\s+)?(?:(\w+)\s+)?"([^"]+)"/);
                    if (goImport && (line.includes('import') || lines.slice(Math.max(0, i - 5), i).some(l => l.includes('import (')))) {
                        const src = goImport[2];
                        imports.push({
                            specifiers: [goImport[1] || path.basename(src)],
                            source: src,
                            isDefault: false,
                            isNamespace: false,
                            line: i + 1,
                        });
                    }
                    break;
                }

                case 'rust': {
                    // use std::collections::HashMap;
                    const useMatch = line.match(/use\s+(.+);/);
                    if (useMatch) {
                        const src = useMatch[1].replace(/::\{[^}]+\}/, '');
                        imports.push({
                            specifiers: [useMatch[1].split('::').pop()?.replace(';', '') || ''],
                            source: src,
                            isDefault: false,
                            isNamespace: false,
                            line: i + 1,
                        });
                    }
                    break;
                }

                case 'java':
                case 'csharp': {
                    // import/using X.Y.Z;
                    const javaImport = line.match(/(?:import|using)\s+(?:static\s+)?([^;]+);/);
                    if (javaImport) {
                        imports.push({
                            specifiers: [javaImport[1].split('.').pop() || ''],
                            source: javaImport[1],
                            isDefault: false,
                            isNamespace: false,
                            line: i + 1,
                        });
                    }
                    break;
                }

                case 'ruby': {
                    // require 'module' or require_relative 'module'
                    const rubyReq = line.match(/require(?:_relative)?\s+['"]([^'"]+)['"]/);
                    if (rubyReq) {
                        imports.push({
                            specifiers: [path.basename(rubyReq[1], path.extname(rubyReq[1]))],
                            source: rubyReq[1],
                            isDefault: true,
                            isNamespace: false,
                            line: i + 1,
                        });
                    }
                    break;
                }

                case 'php': {
                    // use Namespace\Class;
                    const phpUse = line.match(/use\s+([^;]+);/);
                    if (phpUse) {
                        imports.push({
                            specifiers: [phpUse[1].split('\\').pop() || ''],
                            source: phpUse[1],
                            isDefault: false,
                            isNamespace: false,
                            line: i + 1,
                        });
                    }
                    break;
                }
            }
        }

        return imports;
    }

    // --------------------------------------------------------------------------
    // Symbol extraction
    // --------------------------------------------------------------------------

    private extractSymbols(filePath: string, lines: string[], lang: LanguageId): CodeSymbol[] {
        const symbols: CodeSymbol[] = [];

        // Language-specific patterns
        const patterns = this.getPatterns(lang);

        let currentClass: string | undefined;
        let braceDepth = 0;
        let classEndDepth = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Track brace depth for class membership
            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') {
                    braceDepth--;
                    if (braceDepth <= classEndDepth) {
                        currentClass = undefined;
                        classEndDepth = -1;
                    }
                }
            }

            // Skip comments
            if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
                continue;
            }

            // Check each pattern
            for (const pattern of patterns) {
                const match = pattern.regex.exec(trimmed);
                if (!match) continue;

                const exported = /^export\s/.test(trimmed) || /^pub\s/.test(trimmed) || lang === 'python';
                const name = match[pattern.nameGroup || 1];
                if (!name) continue;

                const endLine = this.findBlockEnd(lines, i);

                const symbol: CodeSymbol = {
                    name,
                    kind: currentClass && (pattern.kind === 'function') ? 'method' : pattern.kind,
                    filePath,
                    startLine: i + 1,
                    endLine,
                    signature: trimmed.length > 120 ? trimmed.substring(0, 120) + '...' : trimmed,
                    exported,
                    parent: currentClass,
                };

                symbols.push(symbol);

                // Track class context
                if (pattern.kind === 'class' || pattern.kind === 'interface') {
                    currentClass = name;
                    classEndDepth = braceDepth - 1; // Will exit when we drop back
                }
            }
        }

        return symbols;
    }

    private getPatterns(lang: LanguageId): Array<{ regex: RegExp; kind: SymbolKind; nameGroup?: number }> {
        switch (lang) {
            case 'typescript':
            case 'javascript':
                return [
                    { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, kind: 'class' },
                    { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: 'interface' },
                    { regex: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: 'type' },
                    { regex: /^(?:export\s+)?enum\s+(\w+)/, kind: 'enum' },
                    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function' },
                    { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/, kind: 'function' },
                    { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?[^(]*=>\s*/, kind: 'function' },
                    { regex: /^(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/, kind: 'function' },
                ];

            case 'python':
                return [
                    { regex: /^class\s+(\w+)/, kind: 'class' },
                    { regex: /^(?:async\s+)?def\s+(\w+)/, kind: 'function' },
                ];

            case 'go':
                return [
                    { regex: /^type\s+(\w+)\s+struct/, kind: 'class' },
                    { regex: /^type\s+(\w+)\s+interface/, kind: 'interface' },
                    { regex: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/, kind: 'function' },
                ];

            case 'rust':
                return [
                    { regex: /^(?:pub\s+)?struct\s+(\w+)/, kind: 'class' },
                    { regex: /^(?:pub\s+)?trait\s+(\w+)/, kind: 'interface' },
                    { regex: /^(?:pub\s+)?enum\s+(\w+)/, kind: 'enum' },
                    { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, kind: 'function' },
                    { regex: /^impl(?:<[^>]+>)?\s+(?:\w+\s+for\s+)?(\w+)/, kind: 'class' },
                ];

            case 'java':
                return [
                    { regex: /^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?(?:static\s+)?class\s+(\w+)/, kind: 'class' },
                    { regex: /^(?:public\s+|private\s+|protected\s+)?interface\s+(\w+)/, kind: 'interface' },
                    { regex: /^(?:public\s+|private\s+|protected\s+)?enum\s+(\w+)/, kind: 'enum' },
                    { regex: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:abstract\s+)?(?:\w+\s+)+(\w+)\s*\(/, kind: 'function' },
                ];

            case 'csharp':
                return [
                    { regex: /^(?:public\s+|private\s+|protected\s+|internal\s+)?(?:abstract\s+|sealed\s+)?(?:partial\s+)?class\s+(\w+)/, kind: 'class' },
                    { regex: /^(?:public\s+|private\s+|protected\s+|internal\s+)?interface\s+(\w+)/, kind: 'interface' },
                    { regex: /^(?:public\s+|private\s+|protected\s+|internal\s+)?enum\s+(\w+)/, kind: 'enum' },
                    { regex: /^(?:public\s+|private\s+|protected\s+|internal\s+)?(?:static\s+)?(?:async\s+)?(?:\w+\s+)+(\w+)\s*\(/, kind: 'function' },
                ];

            case 'ruby':
                return [
                    { regex: /^class\s+(\w+)/, kind: 'class' },
                    { regex: /^module\s+(\w+)/, kind: 'class' },
                    { regex: /^def\s+(?:self\.)?(\w+)/, kind: 'function' },
                ];

            case 'php':
                return [
                    { regex: /^(?:abstract\s+)?class\s+(\w+)/, kind: 'class' },
                    { regex: /^interface\s+(\w+)/, kind: 'interface' },
                    { regex: /^trait\s+(\w+)/, kind: 'class' },
                    { regex: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?function\s+(\w+)/, kind: 'function' },
                ];

            default:
                return [];
        }
    }

    /**
     * Find the end of a code block starting at the given line.
     * Uses brace counting for C-like languages, indentation for Python.
     */
    private findBlockEnd(lines: string[], startIdx: number): number {
        const startLine = lines[startIdx];

        // Python: use indentation
        if (/^(?:class|def|async\s+def)\s/.test(startLine.trim())) {
            const baseIndent = startLine.search(/\S/);
            let endIdx = startIdx;

            for (let i = startIdx + 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() === '') continue;
                const indent = line.search(/\S/);
                if (indent <= baseIndent) break;
                endIdx = i;
            }

            return endIdx + 1;
        }

        // C-like: use brace counting
        let depth = 0;
        let foundOpen = false;

        for (let i = startIdx; i < lines.length; i++) {
            for (const ch of lines[i]) {
                if (ch === '{') { depth++; foundOpen = true; }
                if (ch === '}') depth--;

                if (foundOpen && depth === 0) {
                    return i + 1;
                }
            }
        }

        // If no braces found, just return start + 1 (single-line declaration)
        return startIdx + 1;
    }
}

// Singleton instance
let instance: ASTParser | null = null;

export function getASTParser(): ASTParser {
    if (!instance) instance = new ASTParser();
    return instance;
}
